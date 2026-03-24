import { RegimeAnalysis, StrategyName, TradingCycleResult, TradingState } from "../types";
import { loadTradingState, saveTradingState } from "./tradingStateStore";
import { runDcaStrategy, unwindDcaPosition } from "./strategies/dcaStrategy";
import { runGridStrategy, unwindGridPosition } from "./strategies/gridStrategy";

interface TradingConfig {
  enabled: boolean;
  mode: "paper" | "live";
  databaseUrl: string;
  minConfidence: number;
  regimePersistence: {
    entryCycles: number;
    exitCycles: number;
  };
  initialQuoteBalance: number;
  initialBaseBalance: number;
  feeRate: number;
  maxTradeHistory: number;
  closeOnBear: boolean;
  dca: {
    trancheQuote: number;
    maxEntries: number;
    takeProfitPercent: number;
    trailingTakeProfitEnabled: boolean;
    trailingStopPercent: number;
    stopLossPercent: number;
  };
  grid: {
    trancheQuote: number;
    maxLevels: number;
    spacingPercent: number;
    takeProfitPercent: number;
    stopLossPercent: number;
    trailingTakeProfitEnabled: boolean;
    trailingTakeProfitStopPercent: number;
    trailingStopLossEnabled: boolean;
    trailingStopLossPercent: number;
  };
}

function preferredStrategy(analysis: RegimeAnalysis, minConfidence: number): StrategyName {
  if (analysis.regime === "bull" && analysis.confidence >= minConfidence) {
    return "dca";
  }

  if (
    analysis.regime === "sideways" &&
    analysis.primaryRegime === "sideways" &&
    analysis.confidence >= minConfidence
  ) {
    return "grid";
  }

  return "none";
}

function currentStrategyFromState(state: TradingState): StrategyName {
  if (state.dca.baseAmount > 0) {
    return "dca";
  }

  if (state.grid.baseAmount > 0) {
    return "grid";
  }

  return "none";
}

function updatePreferredStrategyStreak(state: TradingState, strategy: StrategyName): number {
  if (state.regimePersistence.lastPreferredStrategy === strategy) {
    state.regimePersistence.preferredStrategyStreak += 1;
  } else {
    state.regimePersistence.lastPreferredStrategy = strategy;
    state.regimePersistence.preferredStrategyStreak = 1;
  }

  return state.regimePersistence.preferredStrategyStreak;
}

function incrementUnsupportedCycles(state: TradingState, strategy: Extract<StrategyName, "dca" | "grid">): number {
  if (strategy === "dca") {
    state.regimePersistence.dcaUnsupportedCycles += 1;
    return state.regimePersistence.dcaUnsupportedCycles;
  }

  state.regimePersistence.gridUnsupportedCycles += 1;
  return state.regimePersistence.gridUnsupportedCycles;
}

function resetUnsupportedCycles(state: TradingState, strategy: Extract<StrategyName, "dca" | "grid">): void {
  if (strategy === "dca") {
    state.regimePersistence.dcaUnsupportedCycles = 0;
    return;
  }

  state.regimePersistence.gridUnsupportedCycles = 0;
}

function round(value: number): number {
  return Number(value.toFixed(8));
}

function executorConfig(symbol: string, config: TradingConfig) {
  return {
    mode: config.mode,
    feeRate: config.feeRate,
    exchangeId: process.env.EXCHANGE_ID,
    symbol
  };
}

function appendBearAction(actionablePoints: string[], analysis: RegimeAnalysis): void {
  if (analysis.regime === "bear") {
    actionablePoints.push("Bear regime detected. No new entries will be opened and open DCA trades are closed.");
  }
}

export async function runTradingCycle(
  analysis: RegimeAnalysis,
  price: number,
  config: TradingConfig
): Promise<TradingCycleResult> {
  if (!config.enabled) {
    return {
      enabled: false,
      mode: config.mode,
      preferredStrategy: "none",
      activeStrategy: "none",
      price: round(price),
      executions: [],
      balances: {
        base: 0,
        quote: 0,
        feesPaid: 0
      },
      dca: {
        entries: 0,
        baseAmount: 0,
        quoteSpent: 0,
        avgEntryPrice: 0,
        lastEntryPrice: 0,
        trailingTakeProfitActive: false,
        highestPriceSinceEntry: 0,
        trailingStopPrice: 0
      },
      grid: {
        entries: 0,
        baseAmount: 0,
        quoteSpent: 0,
        avgEntryPrice: 0,
        lastBuyPrice: 0,
        lastSellPrice: 0,
        trailingTakeProfitActive: false,
        highestPriceSinceEntry: 0,
        trailingTakeProfitStopPrice: 0,
        trailingStopLossPrice: 0,
        levels: []
      },
      actionablePoints: ["Trading automation is disabled."]
    };
  }

  const state = await loadTradingState(analysis.symbol, {
    mode: config.mode,
    databaseUrl: config.databaseUrl,
    initialQuoteBalance: config.initialQuoteBalance,
    initialBaseBalance: config.initialBaseBalance,
    maxTradeHistory: config.maxTradeHistory
  });

  state.lastPrice = round(price);

  const rawPreferredStrategy = preferredStrategy(analysis, config.minConfidence);
  const preferredStrategyStreak = updatePreferredStrategyStreak(state, rawPreferredStrategy);
  const desiredStrategy =
    rawPreferredStrategy !== "none" && preferredStrategyStreak >= config.regimePersistence.entryCycles
      ? rawPreferredStrategy
      : "none";
  const actionablePoints: string[] = [];
  const executions = [];
  const liveConfig = executorConfig(analysis.symbol, config);

  if (analysis.regime === "sideways" && analysis.primaryRegime !== "sideways" && analysis.confidence >= config.minConfidence) {
    actionablePoints.push("Grid strategy is blocked because the primary regime is not sideways.");
  }

  if (state.dca.baseAmount > 0) {
    if (rawPreferredStrategy === "dca") {
      resetUnsupportedCycles(state, "dca");
    } else {
      const unsupportedCycles = incrementUnsupportedCycles(state, "dca");

      if (unsupportedCycles >= config.regimePersistence.exitCycles) {
        executions.push(
          ...(await unwindDcaPosition(
            state,
            price,
            { ...liveConfig, dca: config.dca },
            "Regime changed away from bull and persisted."
          ))
        );
        resetUnsupportedCycles(state, "dca");
        actionablePoints.push("Existing DCA position was closed after the loss of bull support persisted.");
      } else {
        actionablePoints.push(
          `DCA exit is waiting for persistence confirmation (${unsupportedCycles}/${config.regimePersistence.exitCycles}).`
        );
      }
    }
  } else {
    resetUnsupportedCycles(state, "dca");
  }

  if (state.grid.baseAmount > 0) {
    if (rawPreferredStrategy === "grid") {
      resetUnsupportedCycles(state, "grid");
    } else {
      const unsupportedCycles = incrementUnsupportedCycles(state, "grid");

      if (unsupportedCycles >= config.regimePersistence.exitCycles) {
        executions.push(
          ...(await unwindGridPosition(
            state,
            price,
            { ...liveConfig, grid: config.grid },
            "Regime changed away from sideways and persisted."
          ))
        );
        resetUnsupportedCycles(state, "grid");
        actionablePoints.push("Existing grid position was closed after the loss of sideways support persisted.");
      } else {
        actionablePoints.push(
          `Grid exit is waiting for persistence confirmation (${unsupportedCycles}/${config.regimePersistence.exitCycles}).`
        );
      }
    }
  } else {
    resetUnsupportedCycles(state, "grid");
  }

  if (analysis.regime === "bear" && config.closeOnBear) {
    appendBearAction(actionablePoints, analysis);
  }

  if (
    rawPreferredStrategy === "dca" &&
    state.grid.baseAmount === 0 &&
    (state.dca.baseAmount > 0 || desiredStrategy === "dca")
  ) {
    const result = await runDcaStrategy(analysis, price, state, { ...liveConfig, dca: config.dca });
    executions.push(...result.executions);
    actionablePoints.push(...result.actionablePoints);
  } else if (
    rawPreferredStrategy === "grid" &&
    state.dca.baseAmount === 0 &&
    (state.grid.baseAmount > 0 || desiredStrategy === "grid")
  ) {
    const result = await runGridStrategy(analysis, price, state, { ...liveConfig, grid: config.grid });
    executions.push(...result.executions);
    actionablePoints.push(...result.actionablePoints);
  } else {
    if (rawPreferredStrategy === "dca" && state.grid.baseAmount > 0) {
      actionablePoints.push("DCA entry is blocked until the existing grid position is closed.");
    }

    if (rawPreferredStrategy === "grid" && state.dca.baseAmount > 0) {
      actionablePoints.push("Grid entry is blocked until the existing DCA position is closed.");
    }

    if (rawPreferredStrategy !== "none" && desiredStrategy === "none") {
      actionablePoints.push(
        `Entry is waiting for regime persistence confirmation (${preferredStrategyStreak}/${config.regimePersistence.entryCycles}).`
      );
    }

    if (state.dca.baseAmount === 0 && state.grid.baseAmount === 0) {
      actionablePoints.push("No trading strategy is active because only bullish and sideways regimes are traded.");
    }
  }

  state.activeStrategy = currentStrategyFromState(state);

  await saveTradingState(state, {
    mode: config.mode,
    databaseUrl: config.databaseUrl,
    initialQuoteBalance: config.initialQuoteBalance,
    initialBaseBalance: config.initialBaseBalance,
    maxTradeHistory: config.maxTradeHistory
  });

  return {
    enabled: true,
    mode: config.mode,
    preferredStrategy: desiredStrategy,
    activeStrategy: state.activeStrategy,
    price: round(price),
    executions,
    balances: state.balances,
    dca: state.dca,
    grid: state.grid,
    actionablePoints
  };
}