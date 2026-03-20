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
    trailingTakeProfitEnabled: boolean;
    trailingStopPercent: number;
    stopLossPercent: number;
  };
}

function round(value: number): number {
  return Number(value.toFixed(8));
}

function formatPnlMessage(execution: TradeExecution): string {
  const realizedPnlQuote = execution.realizedPnlQuote ?? 0;
  const realizedPnlPercent = execution.realizedPnlPercent ?? 0;

  return `DCA position closed at ${execution.price} with PnL ${realizedPnlQuote} (${realizedPnlPercent}%).`;
}

function dcaStopLossPrice(price: number, config: TradingConfig): number {
  return round(price * (1 - config.dca.stopLossPercent));
}

function dcaTakeProfitPrice(price: number, config: TradingConfig): number {
  return round(price * (1 + config.dca.takeProfitPercent));
}

function resetDcaState(state: TradingState): void {
  state.dca = {
    entries: 0,
    baseAmount: 0,
    quoteSpent: 0,
    avgEntryPrice: 0,
    lastEntryPrice: 0,
    trailingTakeProfitActive: false,
    highestPriceSinceEntry: 0,
    trailingStopPrice: 0
  };
}

function updateHighestPriceSinceEntry(state: TradingState, price: number): void {
  state.dca.highestPriceSinceEntry = round(Math.max(state.dca.highestPriceSinceEntry, price));
}

function armOrUpdateTrailingTakeProfit(state: TradingState, price: number, config: TradingConfig): void {
  updateHighestPriceSinceEntry(state, price);
  const nextHighestPrice = state.dca.highestPriceSinceEntry;
  state.dca.trailingTakeProfitActive = true;
  state.dca.trailingStopPrice = round(nextHighestPrice * (1 - config.dca.trailingStopPercent));
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

  const entryPrice = state.dca.avgEntryPrice;
  const quoteSpent = state.dca.quoteSpent;

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
    const netExitQuote = execution.quoteAmount - execution.feeAmount;
    const realizedPnlQuote = round(netExitQuote - quoteSpent);
    const realizedPnlPercent = quoteSpent > 0 ? round((realizedPnlQuote / quoteSpent) * 100) : 0;

    execution.entryPrice = round(entryPrice);
    execution.stopLossPrice = dcaStopLossPrice(entryPrice, config);
    execution.takeProfitPrice = dcaTakeProfitPrice(entryPrice, config);
    execution.realizedPnlQuote = realizedPnlQuote;
    execution.realizedPnlPercent = realizedPnlPercent;
    execution.note = formatPnlMessage(execution);
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
    updateHighestPriceSinceEntry(state, price);

    const takeProfitPrice = dcaTakeProfitPrice(state.dca.avgEntryPrice, config);
    const stopLossPrice = dcaStopLossPrice(state.dca.avgEntryPrice, config);

    if (config.dca.trailingTakeProfitEnabled) {
      const previousTrailingStopPrice = state.dca.trailingStopPrice;

      if (state.dca.highestPriceSinceEntry >= takeProfitPrice) {
        armOrUpdateTrailingTakeProfit(state, state.dca.highestPriceSinceEntry, config);
        actionablePoints.push(
          state.dca.trailingStopPrice !== previousTrailingStopPrice
            ? `DCA trailing take-profit active. Trigger ${takeProfitPrice}, high ${state.dca.highestPriceSinceEntry}, stop ${state.dca.trailingStopPrice}.`
            : `DCA trailing take-profit remains active. Trigger ${takeProfitPrice}, high ${state.dca.highestPriceSinceEntry}, stop ${state.dca.trailingStopPrice}.`
        );
      } else {
        actionablePoints.push(
          `DCA trailing take-profit is waiting to arm. Trigger ${takeProfitPrice}, current ${round(price)}, high ${state.dca.highestPriceSinceEntry}.`
        );
      }

      if (state.dca.trailingTakeProfitActive && state.dca.trailingStopPrice > 0 && price <= state.dca.trailingStopPrice) {
        executions.push(...(await unwindDcaPosition(state, price, config, "DCA trailing take-profit hit.")));
        const exitExecution = executions.at(-1);
        actionablePoints.push(
          exitExecution?.status === "filled"
            ? formatPnlMessage(exitExecution)
            : "DCA trailing take-profit stop was hit, but the close order was not filled."
        );
        return { executions, actionablePoints };
      }
    } else if (price >= takeProfitPrice) {
      executions.push(...(await unwindDcaPosition(state, price, config, "DCA take-profit hit.")));
      const exitExecution = executions.at(-1);
      actionablePoints.push(
        exitExecution?.status === "filled"
          ? formatPnlMessage(exitExecution)
          : "DCA take-profit threshold reached, but the close order was not filled."
      );
      return { executions, actionablePoints };
    }

    if (price <= stopLossPrice) {
      executions.push(...(await unwindDcaPosition(state, price, config, "DCA stop-loss hit.")));
      const exitExecution = executions.at(-1);
      actionablePoints.push(
        exitExecution?.status === "filled"
          ? formatPnlMessage(exitExecution)
          : "DCA stop-loss threshold reached, but the close order was not filled."
      );
      return { executions, actionablePoints };
    }
  }

  if (analysis.regime !== "bull") {
    if (state.dca.baseAmount > 0) {
      executions.push(...(await unwindDcaPosition(state, price, config, "Bull regime lost.")));
      const exitExecution = executions.at(-1);
      actionablePoints.push(
        exitExecution?.status === "filled"
          ? formatPnlMessage(exitExecution)
          : "Bull regime ended, but the DCA close order was not filled."
      );
    } else {
      actionablePoints.push("DCA strategy is idle because the market is not in a bull regime.");
    }

    return { executions, actionablePoints };
  }

  const openFirstEntry = state.dca.entries === 0;
  const addOnPullback =
    state.dca.entries > 0 &&
    state.dca.entries < config.dca.maxEntries &&
    !state.dca.trailingTakeProfitActive &&
    price <= round(state.dca.lastEntryPrice * (1 - config.dca.stepPercent));

  if (!openFirstEntry && !addOnPullback) {
    actionablePoints.push(
      state.dca.entries >= config.dca.maxEntries
        ? "Bull regime is active, but the DCA position is already at the maximum number of entries."
        : state.dca.trailingTakeProfitActive
          ? "Bull regime is active, but no new DCA entries are allowed while trailing take-profit is armed."
          : `Bull regime is active, but the pullback threshold was not met. Next add requires ${round(
              state.dca.lastEntryPrice * (1 - config.dca.stepPercent)
            )} or lower.`
    );
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
    lastEntryPrice: execution.price,
    trailingTakeProfitActive: false,
    highestPriceSinceEntry: round(Math.max(state.dca.highestPriceSinceEntry, execution.price)),
    trailingStopPrice: 0
  };

  actionablePoints.push(
    openFirstEntry
      ? "Bull regime confirmed. Opened the first DCA tranche."
      : "Bull regime remains intact. Added another DCA tranche on a pullback."
  );

  return { executions, actionablePoints };
}