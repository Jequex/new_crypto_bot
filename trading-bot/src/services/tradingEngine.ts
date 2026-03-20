import { RegimeAnalysis, StrategyName, TradingCycleResult, TradingState } from "../types";
import { loadTradingState, saveTradingState } from "./tradingStateStore";
import { runDcaStrategy, unwindDcaPosition } from "./strategies/dcaStrategy";

interface TradingConfig {
  enabled: boolean;
  mode: "paper" | "live";
  databaseUrl: string;
  minConfidence: number;
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
}

function preferredStrategy(analysis: RegimeAnalysis, minConfidence: number): StrategyName {
  if (analysis.regime === "bull" && analysis.confidence >= minConfidence) {
    return "dca";
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

  const desiredStrategy = preferredStrategy(analysis, config.minConfidence);
  const actionablePoints: string[] = [];
  const executions = [];
  const liveConfig = executorConfig(analysis.symbol, config);

  if (desiredStrategy === "none" && state.dca.baseAmount > 0) {
    executions.push(...(await unwindDcaPosition(state, price, { ...liveConfig, dca: config.dca }, "Regime changed away from bull.")));
    actionablePoints.push("Existing DCA position was closed because the regime is no longer bullish.");
  }

  if (analysis.regime === "bear" && config.closeOnBear) {
    appendBearAction(actionablePoints, analysis);
  }

  if (desiredStrategy === "dca") {
    const result = await runDcaStrategy(analysis, price, state, { ...liveConfig, dca: config.dca });
    executions.push(...result.executions);
    actionablePoints.push(...result.actionablePoints);
    state.activeStrategy = "dca";
  } else {
    state.activeStrategy = "none";
    if (state.dca.baseAmount === 0) {
      actionablePoints.push("No trading strategy is active because only bullish regimes are traded.");
    }
  }

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
    actionablePoints
  };
}