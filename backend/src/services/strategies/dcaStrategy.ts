import { RegimeAnalysis, TradeExecution, TradingState } from "../../types";
import { executeTrade } from "../tradeExecutor";

interface TradingConfig {
  mode: "paper" | "live";
  feeRate: number;
  exchangeId?: string;
  symbol?: string;
  dca: {
    trancheQuote: number;
    maxEntries: number;
    stepPercent: number;
    takeProfitPercent: number;
    stopLossPercent: number;
    exitOnRegimeChange: boolean;
  };
}

function round(value: number): number {
  return Number(value.toFixed(8));
}

function resetDcaState(state: TradingState): void {
  state.dca = {
    entries: 0,
    baseAmount: 0,
    quoteSpent: 0,
    avgEntryPrice: 0,
    lastEntryPrice: 0
  };
}

export async function unwindDcaPosition(
  state: TradingState,
  price: number,
  config: TradingConfig,
  reason: string
): Promise<TradeExecution[]> {
  if (state.dca.baseAmount <= 0) {
    resetDcaState(state);
    return [];
  }

  const execution = await executeTrade(
    state,
    {
      strategy: "dca",
      side: "sell",
      price,
      baseAmount: state.dca.baseAmount,
      reason
    },
    config
  );

  if (execution.status === "filled") {
    resetDcaState(state);
  }

  return [execution];
}

export async function runDcaStrategy(
  analysis: RegimeAnalysis,
  price: number,
  state: TradingState,
  config: TradingConfig
): Promise<{ executions: TradeExecution[]; actionablePoints: string[] }> {
  const executions: TradeExecution[] = [];
  const actionablePoints: string[] = [];

  if (state.dca.baseAmount > 0) {
    const takeProfitPrice = state.dca.avgEntryPrice * (1 + config.dca.takeProfitPercent);
    const stopLossPrice = state.dca.avgEntryPrice * (1 - config.dca.stopLossPercent);

    if (price >= takeProfitPrice) {
      actionablePoints.push("DCA take-profit threshold reached. Closing the bull position.");
      executions.push(...(await unwindDcaPosition(state, price, config, "DCA take-profit hit.")));
      return { executions, actionablePoints };
    }

    if (price <= stopLossPrice) {
      actionablePoints.push("DCA stop-loss threshold reached. Cutting the bull position.");
      executions.push(...(await unwindDcaPosition(state, price, config, "DCA stop-loss hit.")));
      return { executions, actionablePoints };
    }
  }

  if (analysis.regime !== "bull") {
    if (state.dca.baseAmount > 0 && config.dca.exitOnRegimeChange) {
      actionablePoints.push("Bull regime ended. DCA strategy is unwinding the existing position.");
      executions.push(...(await unwindDcaPosition(state, price, config, "Bull regime lost.")));
    } else {
      actionablePoints.push("DCA strategy is idle because the market is not in a bull regime.");
    }

    return { executions, actionablePoints };
  }

  const openFirstEntry = state.dca.entries === 0;
  const addOnPullback =
    state.dca.entries > 0 &&
    state.dca.entries < config.dca.maxEntries; // &&
    // price <= state.dca.lastEntryPrice * (1 - config.dca.stepPercent);

  if (!openFirstEntry && !addOnPullback) {
    actionablePoints.push("Bull regime is active, but DCA entry conditions are not met in this cycle.");
    return { executions, actionablePoints };
  }

  const baseAmount = round(config.dca.trancheQuote / price);
  const execution = await executeTrade(
    state,
    {
      strategy: "dca",
      side: "buy",
      price,
      baseAmount,
      reason: openFirstEntry ? "Open DCA bull position." : "Add DCA tranche on pullback."
    },
    config
  );

  executions.push(execution);

  if (execution.status !== "filled") {
    actionablePoints.push(`DCA trade was skipped: ${execution.note ?? "unknown reason"}.`);
    return { executions, actionablePoints };
  }

  const nextQuoteSpent = state.dca.quoteSpent + execution.quoteAmount + execution.feeAmount;
  const nextBaseAmount = state.dca.baseAmount + execution.baseAmount;

  state.dca = {
    entries: state.dca.entries + 1,
    baseAmount: round(nextBaseAmount),
    quoteSpent: round(nextQuoteSpent),
    avgEntryPrice: round(nextQuoteSpent / nextBaseAmount),
    lastEntryPrice: execution.price
  };

  actionablePoints.push(
    openFirstEntry
      ? "Bull regime confirmed. Opened the first DCA tranche."
      : "Bull regime remains intact. Added another DCA tranche on a pullback."
  );

  return { executions, actionablePoints };
}