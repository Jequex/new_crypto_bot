import { RegimeAnalysis, GridLevel, TradeExecution, TradingState } from "../../types";
import { executeTrade } from "../tradeExecutor";

interface TradingConfig {
  mode: "paper" | "live";
  feeRate: number;
  exchangeId?: string;
  symbol?: string;
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

function round(value: number): number {
  return Number(value.toFixed(8));
}

function emptyGridState() {
  return {
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
    levels: [] as GridLevel[]
  };
}

function updateGridHigh(state: TradingState, price: number): void {
  state.grid.highestPriceSinceEntry = round(Math.max(state.grid.highestPriceSinceEntry, price));
}

function updateTrailingStopLoss(state: TradingState, price: number, config: TradingConfig): void {
  if (!config.grid.trailingStopLossEnabled || state.grid.baseAmount <= 0) {
    state.grid.trailingStopLossPrice = 0;
    return;
  }

  updateGridHigh(state, price);
  const nextStop = round(state.grid.highestPriceSinceEntry * (1 - config.grid.trailingStopLossPercent));
  state.grid.trailingStopLossPrice = round(Math.max(state.grid.trailingStopLossPrice, nextStop));
}

function armOrUpdateTrailingTakeProfit(state: TradingState, price: number, config: TradingConfig): void {
  updateGridHigh(state, price);
  state.grid.trailingTakeProfitActive = true;
  state.grid.trailingTakeProfitStopPrice = round(
    state.grid.highestPriceSinceEntry * (1 - config.grid.trailingTakeProfitStopPercent)
  );
}

function applyGridLevels(state: TradingState, levels: GridLevel[], overrides?: Partial<TradingState["grid"]>): void {
  const normalizedLevels = levels.map((level) => ({
    baseAmount: round(level.baseAmount),
    entryPrice: round(level.entryPrice),
    quoteSpent: round(level.quoteSpent),
    feeAmount: round(level.feeAmount)
  }));
  const nextBaseAmount = round(normalizedLevels.reduce((sum, level) => sum + level.baseAmount, 0));
  const nextQuoteSpent = round(normalizedLevels.reduce((sum, level) => sum + level.quoteSpent, 0));

  state.grid = {
    ...emptyGridState(),
    ...state.grid,
    ...overrides,
    entries: normalizedLevels.length,
    baseAmount: nextBaseAmount,
    quoteSpent: nextQuoteSpent,
    avgEntryPrice: nextBaseAmount > 0 ? round(nextQuoteSpent / nextBaseAmount) : 0,
    levels: normalizedLevels
  };

  if (state.grid.entries === 0) {
    state.grid.highestPriceSinceEntry = 0;
    state.grid.trailingTakeProfitActive = false;
    state.grid.trailingTakeProfitStopPrice = 0;
    state.grid.trailingStopLossPrice = 0;
  }
}

function resetGridState(state: TradingState): void {
  state.grid = emptyGridState();
}

function formatGridPnlMessage(execution: TradeExecution): string {
  const realizedPnlQuote = execution.realizedPnlQuote ?? 0;
  const realizedPnlPercent = execution.realizedPnlPercent ?? 0;

  return `Grid tranche closed at ${execution.price} with PnL ${realizedPnlQuote} (${realizedPnlPercent}%).`;
}

function gridTakeProfitPrice(entryPrice: number, config: TradingConfig): number {
  return round(entryPrice * (1 + config.grid.takeProfitPercent));
}

function gridStopLossPrice(entryPrice: number, config: TradingConfig): number {
  return round(entryPrice * (1 - config.grid.stopLossPercent));
}

function nextGridBuyPrice(state: TradingState, config: TradingConfig): number {
  const anchorPrice = state.grid.lastBuyPrice > 0 ? state.grid.lastBuyPrice : state.grid.avgEntryPrice;
  return round(anchorPrice * (1 - config.grid.spacingPercent));
}

function profitableGridLevel(state: TradingState, price: number, config: TradingConfig): GridLevel | undefined {
  const profitableLevels = state.grid.levels.filter((level) => price >= gridTakeProfitPrice(level.entryPrice, config));

  return profitableLevels.sort((left, right) => right.entryPrice - left.entryPrice)[0];
}

async function buyGridLevel(
  state: TradingState,
  price: number,
  config: TradingConfig,
  reason: string
): Promise<TradeExecution> {
  const baseAmount = round(config.grid.trancheQuote / price);
  const execution = await executeTrade(
    state,
    {
      strategy: "grid",
      side: "buy",
      price,
      baseAmount,
      reason
    },
    config
  );

  if (execution.status !== "filled") {
    return execution;
  }

  applyGridLevels(
    state,
    [
      ...state.grid.levels,
      {
        baseAmount: execution.baseAmount,
        entryPrice: execution.price,
        quoteSpent: execution.quoteAmount + execution.feeAmount,
        feeAmount: execution.feeAmount
      }
    ],
    {
      lastBuyPrice: execution.price,
      highestPriceSinceEntry: round(Math.max(state.grid.highestPriceSinceEntry, execution.price))
    }
  );

  updateTrailingStopLoss(state, execution.price, config);

  return execution;
}

async function sellGridLevel(
  state: TradingState,
  level: GridLevel,
  price: number,
  config: TradingConfig,
  reason: string
): Promise<TradeExecution> {
  const execution = await executeTrade(
    state,
    {
      strategy: "grid",
      side: "sell",
      price,
      baseAmount: level.baseAmount,
      reason
    },
    config
  );

  if (execution.status !== "filled") {
    return execution;
  }

  const netExitQuote = execution.quoteAmount - execution.feeAmount;
  const realizedPnlQuote = round(netExitQuote - level.quoteSpent);
  const realizedPnlPercent = level.quoteSpent > 0 ? round((realizedPnlQuote / level.quoteSpent) * 100) : 0;

  execution.entryPrice = level.entryPrice;
  execution.takeProfitPrice = gridTakeProfitPrice(level.entryPrice, config);
  execution.stopLossPrice = gridStopLossPrice(level.entryPrice, config);
  execution.realizedPnlQuote = realizedPnlQuote;
  execution.realizedPnlPercent = realizedPnlPercent;
  execution.note = formatGridPnlMessage(execution);

  const soldLevelIndex = state.grid.levels.findIndex(
    (candidate) =>
      candidate.entryPrice === level.entryPrice &&
      candidate.baseAmount === level.baseAmount &&
      candidate.quoteSpent === level.quoteSpent
  );
  const remainingLevels = state.grid.levels.filter((_, index) => index !== soldLevelIndex);

  applyGridLevels(state, remainingLevels, { lastSellPrice: execution.price });

  if (remainingLevels.length === 0) {
    resetGridState(state);
  }

  return execution;
}

export async function unwindGridPosition(
  state: TradingState,
  price: number,
  config: TradingConfig,
  reason: string
): Promise<TradeExecution[]> {
  if (state.grid.baseAmount <= 0) {
    resetGridState(state);
    return [];
  }

  const quoteSpent = state.grid.quoteSpent;
  const entryPrice = state.grid.avgEntryPrice;
  const execution = await executeTrade(
    state,
    {
      strategy: "grid",
      side: "sell",
      price,
      baseAmount: state.grid.baseAmount,
      reason
    },
    config
  );

  if (execution.status === "filled") {
    const netExitQuote = execution.quoteAmount - execution.feeAmount;
    const realizedPnlQuote = round(netExitQuote - quoteSpent);
    const realizedPnlPercent = quoteSpent > 0 ? round((realizedPnlQuote / quoteSpent) * 100) : 0;

    execution.entryPrice = round(entryPrice);
    execution.takeProfitPrice = gridTakeProfitPrice(entryPrice, config);
    execution.stopLossPrice = gridStopLossPrice(entryPrice, config);
    execution.realizedPnlQuote = realizedPnlQuote;
    execution.realizedPnlPercent = realizedPnlPercent;
    execution.note = `Grid position closed at ${execution.price} with PnL ${realizedPnlQuote} (${realizedPnlPercent}%).`;
    resetGridState(state);
  }

  return [execution];
}

export async function runGridStrategy(
  analysis: RegimeAnalysis,
  price: number,
  state: TradingState,
  config: TradingConfig
): Promise<{ executions: TradeExecution[]; actionablePoints: string[] }> {
  const executions: TradeExecution[] = [];
  const actionablePoints: string[] = [];

  if (analysis.regime !== "sideways") {
    if (state.grid.baseAmount > 0) {
      executions.push(...(await unwindGridPosition(state, price, config, "Sideways regime lost.")));
      const exitExecution = executions.at(-1);
      actionablePoints.push(
        exitExecution?.status === "filled"
          ? String(exitExecution.note ?? formatGridPnlMessage(exitExecution))
          : "Sideways regime ended, but the grid close order was not filled."
      );
    } else {
      actionablePoints.push("Grid strategy is idle because the market is not in a sideways regime.");
    }

    return { executions, actionablePoints };
  }

  if (state.grid.baseAmount > 0) {
    updateGridHigh(state, price);
    updateTrailingStopLoss(state, price, config);

    const stopLossPrice = gridStopLossPrice(state.grid.avgEntryPrice, config);
    const effectiveStopLossPrice =
      state.grid.trailingStopLossPrice > 0
        ? round(Math.max(stopLossPrice, state.grid.trailingStopLossPrice))
        : stopLossPrice;

    if (price <= effectiveStopLossPrice) {
      const stopReason =
        state.grid.trailingStopLossPrice > 0 && effectiveStopLossPrice === state.grid.trailingStopLossPrice
          ? "Grid trailing stop-loss hit."
          : "Grid stop-loss hit.";
      executions.push(...(await unwindGridPosition(state, price, config, stopReason)));
      const exitExecution = executions.at(-1);
      actionablePoints.push(
        exitExecution?.status === "filled"
          ? String(exitExecution.note ?? `${stopReason} Closed at ${exitExecution.price}.`)
          : `${stopReason} The close order was not filled.`
      );
      return { executions, actionablePoints };
    }

    const takeProfitTriggerPrice = gridTakeProfitPrice(state.grid.avgEntryPrice, config);

    if (config.grid.trailingTakeProfitEnabled) {
      if (state.grid.highestPriceSinceEntry >= takeProfitTriggerPrice) {
        const previousStop = state.grid.trailingTakeProfitStopPrice;
        armOrUpdateTrailingTakeProfit(state, state.grid.highestPriceSinceEntry, config);
        actionablePoints.push(
          state.grid.trailingTakeProfitStopPrice !== previousStop
            ? `Grid trailing take-profit active. Trigger ${takeProfitTriggerPrice}, high ${state.grid.highestPriceSinceEntry}, stop ${state.grid.trailingTakeProfitStopPrice}.`
            : `Grid trailing take-profit remains active. Trigger ${takeProfitTriggerPrice}, high ${state.grid.highestPriceSinceEntry}, stop ${state.grid.trailingTakeProfitStopPrice}.`
        );
      } else {
        actionablePoints.push(
          `Grid trailing take-profit is waiting to arm. Trigger ${takeProfitTriggerPrice}, current ${round(price)}, high ${state.grid.highestPriceSinceEntry}.`
        );
      }

      if (
        state.grid.trailingTakeProfitActive &&
        state.grid.trailingTakeProfitStopPrice > 0 &&
        price <= state.grid.trailingTakeProfitStopPrice
      ) {
        executions.push(...(await unwindGridPosition(state, price, config, "Grid trailing take-profit hit.")));
        const exitExecution = executions.at(-1);
        actionablePoints.push(
          exitExecution?.status === "filled"
            ? String(exitExecution.note ?? `Grid trailing take-profit closed at ${exitExecution?.price}.`)
            : "Grid trailing take-profit threshold was reached, but the close order was not filled."
        );
        return { executions, actionablePoints };
      }
    } else {
      const levelToSell = profitableGridLevel(state, price, config);
      if (levelToSell) {
        const execution = await sellGridLevel(state, levelToSell, price, config, "Grid take-profit hit.");
        executions.push(execution);
        actionablePoints.push(
          execution.status === "filled"
            ? String(execution.note ?? formatGridPnlMessage(execution))
            : "Grid take-profit threshold was reached, but the sell order was not filled."
        );
        return { executions, actionablePoints };
      }
    }
  }

  const openFirstLevel = state.grid.entries === 0;
  const canAddLevel =
    state.grid.entries > 0 &&
    state.grid.entries < config.grid.maxLevels &&
    !state.grid.trailingTakeProfitActive &&
    price <= nextGridBuyPrice(state, config);

  if (openFirstLevel || canAddLevel) {
    const execution = await buyGridLevel(
      state,
      price,
      config,
      openFirstLevel ? "Open initial grid level in sideways market." : "Add lower grid level while sideways regime remains active."
    );
    executions.push(execution);

    actionablePoints.push(
      execution.status === "filled"
        ? openFirstLevel
          ? "Sideways regime confirmed. Opened the first grid level."
          : "Sideways regime remains intact. Added another grid level on the lower boundary."
        : `Grid trade was skipped: ${execution.note ?? "unknown reason"}.`
    );

    return { executions, actionablePoints };
  }

  if (state.grid.entries >= config.grid.maxLevels) {
    actionablePoints.push("Sideways regime is active, but the grid already has the maximum number of open levels.");
  } else if (state.grid.trailingTakeProfitActive) {
    actionablePoints.push("Sideways regime is active, but no new grid levels are opened while trailing take-profit is armed.");
  } else if (state.grid.entries > 0) {
    const nextBuy = nextGridBuyPrice(state, config);
    const nextSell = Math.min(...state.grid.levels.map((level) => gridTakeProfitPrice(level.entryPrice, config)));
    actionablePoints.push(
      `Grid is waiting. Next buy at ${nextBuy} or lower, next sell at ${round(nextSell)} or higher.`
    );
  } else {
    actionablePoints.push("Sideways regime is active, but the initial grid level could not be opened yet.");
  }

  return { executions, actionablePoints };
}