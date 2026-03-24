import { TradeExecution, TradingMode, TradingState } from "../types";
import { withDatabaseClient } from "./database";

interface TradingStoreConfig {
  mode: "paper" | "live";
  databaseUrl: string;
  initialQuoteBalance: number;
  initialBaseBalance: number;
  maxTradeHistory: number;
}

function initialState(symbol: string, config: TradingStoreConfig): TradingState {
  return {
    symbol,
    mode: config.mode,
    activeStrategy: "none",
    lastPrice: 0,
    balances: {
      base: config.initialBaseBalance,
      quote: config.initialQuoteBalance,
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
    regimePersistence: {
      lastPreferredStrategy: "none",
      preferredStrategyStreak: 0,
      dcaUnsupportedCycles: 0,
      gridUnsupportedCycles: 0
    },
    tradeHistory: [],
    lastUpdated: new Date().toISOString()
  };
}

function normalizeTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return new Date(value).toISOString();
  }

  return new Date().toISOString();
}

function mapTradeExecution(row: Record<string, unknown>): TradeExecution {
  return {
    id: String(row.id),
    timestamp: normalizeTimestamp(row.timestamp),
    mode: row.mode as TradeExecution["mode"],
    strategy: row.strategy as TradeExecution["strategy"],
    side: row.side as TradeExecution["side"],
    price: Number(row.price),
    entryPrice: row.entryPrice === null || row.entryPrice === undefined ? undefined : Number(row.entryPrice),
    stopLossPrice:
      row.stopLossPrice === null || row.stopLossPrice === undefined ? undefined : Number(row.stopLossPrice),
    takeProfitPrice:
      row.takeProfitPrice === null || row.takeProfitPrice === undefined ? undefined : Number(row.takeProfitPrice),
    baseAmount: Number(row.baseAmount),
    quoteAmount: Number(row.quoteAmount),
    feeAmount: Number(row.feeAmount),
    realizedPnlQuote:
      row.realizedPnlQuote === null || row.realizedPnlQuote === undefined ? undefined : Number(row.realizedPnlQuote),
    realizedPnlPercent:
      row.realizedPnlPercent === null || row.realizedPnlPercent === undefined ? undefined : Number(row.realizedPnlPercent),
    status: row.status as TradeExecution["status"],
    reason: String(row.reason),
    note: row.note === null || row.note === undefined ? undefined : String(row.note)
  };
}

async function loadTradeHistory(
  client: Parameters<Parameters<typeof withDatabaseClient>[1]>[0],
  symbol: string,
  mode: TradingMode,
  limit: number
): Promise<TradeExecution[]> {
  const tradeHistoryResult = await client.query<Record<string, unknown>>(
    `
      SELECT
        id,
        timestamp,
        mode,
        strategy,
        side,
        price,
        entry_price AS "entryPrice",
        stop_loss_price AS "stopLossPrice",
        take_profit_price AS "takeProfitPrice",
        base_amount AS "baseAmount",
        quote_amount AS "quoteAmount",
        fee_amount AS "feeAmount",
        realized_pnl_quote AS "realizedPnlQuote",
        realized_pnl_percent AS "realizedPnlPercent",
        status,
        reason,
        note
      FROM trade_executions
      WHERE symbol = $1 AND mode = $2
      ORDER BY timestamp DESC
      LIMIT $3
    `,
    [symbol, mode, limit]
  );

  return tradeHistoryResult.rows.map(mapTradeExecution).reverse();
}

export async function loadTradingState(
  symbol: string,
  config: TradingStoreConfig
): Promise<TradingState> {
  return withDatabaseClient(config.databaseUrl, async (client) => {
    const stateResult = await client.query<{
      active_strategy: TradingState["activeStrategy"];
      last_price: number;
      balances: TradingState["balances"];
      dca: TradingState["dca"];
      grid: TradingState["grid"];
      regime_persistence: TradingState["regimePersistence"];
      last_updated: string | Date;
    }>(
      `
        SELECT active_strategy, last_price, balances, dca, grid, regime_persistence, last_updated
        FROM trading_states
        WHERE symbol = $1 AND mode = $2
      `,
      [symbol, config.mode]
    );

    if (stateResult.rowCount === 0) {
      return initialState(symbol, config);
    }

    const row = stateResult.rows[0];
    const tradeHistory = await loadTradeHistory(client, symbol, config.mode, config.maxTradeHistory);

    return {
      symbol,
      mode: config.mode,
      activeStrategy: row.active_strategy,
      lastPrice: Number(row.last_price ?? 0),
      balances: row.balances,
      dca: {
        ...initialState(symbol, config).dca,
        ...row.dca
      },
      grid: {
        ...initialState(symbol, config).grid,
        ...row.grid,
        levels: Array.isArray(row.grid?.levels) ? row.grid.levels : []
      },
      regimePersistence: {
        ...initialState(symbol, config).regimePersistence,
        ...row.regime_persistence
      },
      tradeHistory,
      lastUpdated: normalizeTimestamp(row.last_updated)
    };
  });
}

export async function listTradingStates(
  config: TradingStoreConfig,
  filters?: { mode?: TradingMode; symbol?: string }
): Promise<TradingState[]> {
  return withDatabaseClient(config.databaseUrl, async (client) => {
    const clauses: string[] = [];
    const values: Array<string> = [];

    if (filters?.symbol) {
      values.push(filters.symbol);
      clauses.push(`symbol = $${values.length}`);
    }

    if (filters?.mode) {
      values.push(filters.mode);
      clauses.push(`mode = $${values.length}`);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const stateResult = await client.query<{
      symbol: string;
      mode: TradingMode;
      active_strategy: TradingState["activeStrategy"];
      last_price: number;
      balances: TradingState["balances"];
      dca: TradingState["dca"];
      grid: TradingState["grid"];
      regime_persistence: TradingState["regimePersistence"];
      last_updated: string | Date;
    }>(
      `
        SELECT symbol, mode, active_strategy, last_price, balances, dca, grid, regime_persistence, last_updated
        FROM trading_states
        ${whereClause}
        ORDER BY symbol ASC, mode ASC
      `,
      values
    );

    return Promise.all(
      stateResult.rows.map(async (row) => ({
        symbol: row.symbol,
        mode: row.mode,
        activeStrategy: row.active_strategy,
        lastPrice: Number(row.last_price ?? 0),
        balances: row.balances,
        dca: {
          ...initialState(row.symbol, {
            ...config,
            mode: row.mode
          }).dca,
          ...row.dca
        },
        grid: {
          ...initialState(row.symbol, {
            ...config,
            mode: row.mode
          }).grid,
          ...row.grid,
          levels: Array.isArray(row.grid?.levels) ? row.grid.levels : []
        },
        regimePersistence: {
          ...initialState(row.symbol, {
            ...config,
            mode: row.mode
          }).regimePersistence,
          ...row.regime_persistence
        },
        tradeHistory: await loadTradeHistory(client, row.symbol, row.mode, config.maxTradeHistory),
        lastUpdated: normalizeTimestamp(row.last_updated)
      }))
    );
  });
}

export async function listTradeExecutions(
  databaseUrl: string,
  filters: { mode?: TradingMode; symbol: string; page: number; pageSize: number }
): Promise<{ items: TradeExecution[]; total: number; page: number; pageSize: number }> {
  return withDatabaseClient(databaseUrl, async (client) => {
    const clauses: string[] = [];
    const values: Array<string | number> = [];

    values.push(filters.symbol);
    clauses.push(`symbol = $${values.length}`);

    if (filters.mode) {
      values.push(filters.mode);
      clauses.push(`mode = $${values.length}`);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const countResult = await client.query<{ total: string }>(
      `
        SELECT COUNT(*)::text AS total
        FROM trade_executions
        ${whereClause}
      `,
      values
    );

    const offset = (filters.page - 1) * filters.pageSize;
    const pagedValues = [...values, filters.pageSize, offset];

    const result = await client.query<Record<string, unknown>>(
      `
        SELECT
          id,
          timestamp,
          mode,
          strategy,
          side,
          price,
          entry_price AS "entryPrice",
          stop_loss_price AS "stopLossPrice",
          take_profit_price AS "takeProfitPrice",
          base_amount AS "baseAmount",
          quote_amount AS "quoteAmount",
          fee_amount AS "feeAmount",
          realized_pnl_quote AS "realizedPnlQuote",
          realized_pnl_percent AS "realizedPnlPercent",
          status,
          reason,
          note
        FROM trade_executions
        ${whereClause}
        ORDER BY timestamp DESC
        LIMIT $${pagedValues.length - 1}
        OFFSET $${pagedValues.length}
      `,
      pagedValues
    );

    return {
      items: result.rows.map(mapTradeExecution),
      total: Number(countResult.rows[0]?.total ?? 0),
      page: filters.page,
      pageSize: filters.pageSize
    };
  });
}

export async function saveTradingState(state: TradingState, config: TradingStoreConfig): Promise<void> {
  const trimmedTradeHistory = state.tradeHistory.slice(-config.maxTradeHistory);
  const lastUpdated = new Date().toISOString();

  state.tradeHistory = trimmedTradeHistory;
  state.lastUpdated = lastUpdated;

  await withDatabaseClient(config.databaseUrl, async (client) => {
    await client.query("BEGIN");

    try {
      await client.query(
        `
          INSERT INTO trading_states (
            symbol,
            mode,
            active_strategy,
            last_price,
            balances,
            dca,
            grid,
            regime_persistence,
            last_updated
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9)
          ON CONFLICT (symbol, mode)
          DO UPDATE SET
            active_strategy = EXCLUDED.active_strategy,
            last_price = EXCLUDED.last_price,
            balances = EXCLUDED.balances,
            dca = EXCLUDED.dca,
            grid = EXCLUDED.grid,
            regime_persistence = EXCLUDED.regime_persistence,
            last_updated = EXCLUDED.last_updated
        `,
        [
          state.symbol,
          state.mode,
          state.activeStrategy,
          state.lastPrice,
          JSON.stringify(state.balances),
          JSON.stringify(state.dca),
          JSON.stringify(state.grid),
          JSON.stringify(state.regimePersistence),
          lastUpdated
        ]
      );

      for (const execution of trimmedTradeHistory) {
        await client.query(
          `
            INSERT INTO trade_executions (
              id,
              symbol,
              mode,
              strategy,
              side,
              price,
              entry_price,
              stop_loss_price,
              take_profit_price,
              base_amount,
              quote_amount,
              fee_amount,
              realized_pnl_quote,
              realized_pnl_percent,
              status,
              reason,
              note,
              timestamp
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
            )
            ON CONFLICT (id) DO NOTHING
          `,
          [
            execution.id,
            state.symbol,
            execution.mode,
            execution.strategy,
            execution.side,
            execution.price,
            execution.entryPrice ?? null,
            execution.stopLossPrice ?? null,
            execution.takeProfitPrice ?? null,
            execution.baseAmount,
            execution.quoteAmount,
            execution.feeAmount,
            execution.realizedPnlQuote ?? null,
            execution.realizedPnlPercent ?? null,
            execution.status,
            execution.reason,
            execution.note ?? null,
            execution.timestamp
          ]
        );
      }

      await client.query(
        `
          DELETE FROM trade_executions
          WHERE id IN (
            SELECT id
            FROM trade_executions
            WHERE symbol = $1 AND mode = $2
            ORDER BY timestamp DESC
            OFFSET $3
          )
        `,
        [state.symbol, state.mode, config.maxTradeHistory]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}