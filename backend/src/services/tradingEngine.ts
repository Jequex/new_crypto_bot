import { RegimeAnalysis, StrategyName, TradingCycleResult, TradingState } from "../types";
import { loadTradingState, saveTradingState } from "./tradingStateStore";
import { runDcaStrategy, unwindDcaPosition } from "./strategies/dcaStrategy";
import { runGridStrategy, unwindGridPosition } from "./strategies/gridStrategy";

interface TradingConfig {
  enabled: boolean;
  mode: "paper" | "live";
  stateFilePath: string;
  minConfidence: number;
  initialQuoteBalance: number;
  initialBaseBalance: number;
  feeRate: number;
  maxTradeHistory: number;
  closeOnBear: boolean;
  dca: {
    trancheQuote: number;
    maxEntries: number;
    stepPercent: number;
    takeProfitPercent: number;
    trailingTakeProfitEnabled: boolean;
    trailingStopPercent: number;
    stopLossPercent: number;
    exitOnRegimeChange: boolean;
  };
  grid: {
    levels: number;
    spacingPercent: number;
    quotePerLevel: number;
    reanchorThresholdPercent: number;
    exitOnRegimeChange: boolean;
  };
}

function preferredStrategy(analysis: RegimeAnalysis, minConfidence: number): StrategyName {
  if (analysis.regime === "bull" && analysis.confidence >= minConfidence) {
    return "dca";
  }

  if (analysis.regime === "sideways" && analysis.confidence >= minConfidence) {
    return "grid";
  }

  return "none";
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
    actionablePoints.push("Bear regime detected. No new DCA or grid entries will be opened.");
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
      grid: null,
      actionablePoints: ["Trading automation is disabled."]
    };
  }

  const state = await loadTradingState(analysis.symbol, {
    mode: config.mode,
    stateFilePath: config.stateFilePath,
    initialQuoteBalance: config.initialQuoteBalance,
    initialBaseBalance: config.initialBaseBalance,
    maxTradeHistory: config.maxTradeHistory
  });

  const desiredStrategy = preferredStrategy(analysis, config.minConfidence);
  const actionablePoints: string[] = [];
  const executions = [];
  const liveConfig = executorConfig(analysis.symbol, config);

  if (desiredStrategy !== "dca" && state.dca.baseAmount > 0 && config.dca.exitOnRegimeChange) {
    executions.push(...(await unwindDcaPosition(state, price, { ...liveConfig, dca: config.dca }, "Switching away from DCA regime.")));
    actionablePoints.push("Existing DCA position was unwound before strategy handoff.");
  }

  if (desiredStrategy !== "grid" && state.grid && config.grid.exitOnRegimeChange) {
    executions.push(...(await unwindGridPosition(state, price, { ...liveConfig, grid: config.grid }, "Switching away from grid regime.")));
    actionablePoints.push("Existing grid inventory was unwound before strategy handoff.");
  }

  if (analysis.regime === "bear" && config.closeOnBear) {
    appendBearAction(actionablePoints, analysis);
  }

  if (desiredStrategy === "dca") {
    const result = await runDcaStrategy(analysis, price, state, { ...liveConfig, dca: config.dca });
    executions.push(...result.executions);
    actionablePoints.push(...result.actionablePoints);
    state.activeStrategy = "dca";
  } else if (desiredStrategy === "grid") {
    const result = await runGridStrategy(analysis, price, state, { ...liveConfig, grid: config.grid });
    executions.push(...result.executions);
    actionablePoints.push(...result.actionablePoints);
    state.activeStrategy = "grid";
  } else {
    state.activeStrategy = "none";
    actionablePoints.push("No trading strategy is active because the current prediction does not meet deployment rules.");
  }

  await saveTradingState(state, {
    mode: config.mode,
    stateFilePath: config.stateFilePath,
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