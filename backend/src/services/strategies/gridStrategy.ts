import { GridState, RegimeAnalysis, TradeExecution, TradingState } from "../../types";
import { executeTrade } from "../tradeExecutor";

interface TradingConfig {
  mode: "paper" | "live";
  feeRate: number;
  exchangeId?: string;
  symbol?: string;
  grid: {
    levels: number;
    spacingPercent: number;
    quotePerLevel: number;
    reanchorThresholdPercent: number;
    exitOnRegimeChange: boolean;
  };
}

function round(value: number): number {
  return Number(value.toFixed(8));
}

function buildGrid(anchorPrice: number, levels: number, spacingPercent: number): GridState {
  return {
    anchorPrice: round(anchorPrice),
    spacingPercent,
    levels: Array.from({ length: levels }, (_, index) => {
      const levelIndex = index + 1;
      const buyPrice = anchorPrice * (1 - spacingPercent * levelIndex);

      return {
        index: levelIndex,
        buyPrice: round(buyPrice),
        sellPrice: round(buyPrice * (1 + spacingPercent)),
        status: "empty",
        baseAmount: 0,
        entryPrice: 0
      };
    })
  };
}

function hasOpenGridPosition(grid: GridState | null): boolean {
  return Boolean(grid?.levels.some((level) => level.status === "filled"));
}

export async function unwindGridPosition(
  state: TradingState,
  price: number,
  config: TradingConfig,
  reason: string
): Promise<TradeExecution[]> {
  if (!state.grid) {
    return [];
  }

  const executions: TradeExecution[] = [];

  for (const level of state.grid.levels) {
    if (level.status !== "filled" || level.baseAmount <= 0) {
      continue;
    }

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

    executions.push(execution);

    if (execution.status === "filled") {
      level.status = "empty";
      level.baseAmount = 0;
      level.entryPrice = 0;
    }
  }

  state.grid = null;
  return executions;
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
    if (state.grid && config.grid.exitOnRegimeChange) {
      actionablePoints.push("Sideways regime ended. Grid strategy is flattening open inventory.");
      executions.push(...(await unwindGridPosition(state, price, config, "Sideways regime lost.")));
    } else {
      actionablePoints.push("Grid strategy is idle because the market is not sideways.");
    }

    return { executions, actionablePoints };
  }

  if (!state.grid) {
    state.grid = buildGrid(price, config.grid.levels, config.grid.spacingPercent);
    actionablePoints.push("Initialized a new sideways grid around the current anchor price.");
  }

  if (!hasOpenGridPosition(state.grid)) {
    const drift = Math.abs(price - state.grid.anchorPrice) / state.grid.anchorPrice;

    if (drift >= config.grid.reanchorThresholdPercent) {
      state.grid = buildGrid(price, config.grid.levels, config.grid.spacingPercent);
      actionablePoints.push("Price drifted beyond the grid anchor threshold, so the grid was re-anchored.");
    }
  }

  for (const level of state.grid.levels) {
    if (level.status === "empty" && price <= level.buyPrice) {
      const baseAmount = round(config.grid.quotePerLevel / price);
      const execution = await executeTrade(
        state,
        {
          strategy: "grid",
          side: "buy",
          price,
          baseAmount,
          reason: `Grid buy at level ${level.index}.`
        },
        config
      );

      executions.push(execution);

      if (execution.status === "filled") {
        level.status = "filled";
        level.baseAmount = execution.baseAmount;
        level.entryPrice = execution.price;
        actionablePoints.push(`Filled grid buy level ${level.index} below the anchor.`);
      }

      continue;
    }

    if (level.status === "filled" && price >= level.sellPrice) {
      const execution = await executeTrade(
        state,
        {
          strategy: "grid",
          side: "sell",
          price,
          baseAmount: level.baseAmount,
          reason: `Grid sell at level ${level.index}.`
        },
        config
      );

      executions.push(execution);

      if (execution.status === "filled") {
        level.status = "empty";
        level.baseAmount = 0;
        level.entryPrice = 0;
        actionablePoints.push(`Took profit on grid level ${level.index} as price reverted upward.`);
      }
    }
  }

  if (executions.length === 0) {
    actionablePoints.push("Grid is active, but price has not touched a buy or sell level this cycle.");
  }

  return { executions, actionablePoints };
}