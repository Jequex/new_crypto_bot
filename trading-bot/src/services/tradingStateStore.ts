import { readFile } from "fs/promises";
import { dirname, extname, join, resolve } from "path";

import { TradeExecution, TradingState } from "../types";
import { withDatabaseClient } from "./database";

interface TradingStoreConfig {
  mode: "paper" | "live";
  databaseUrl: string;
  legacyStateFilePath?: string;
  initialQuoteBalance: number;
  initialBaseBalance: number;
  maxTradeHistory: number;
}

function initialState(symbol: string, config: TradingStoreConfig): TradingState {
  return {
    symbol,
    mode: config.mode,
    activeStrategy: "none",
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
    tradeHistory: [],
    lastUpdated: new Date().toISOString()
  };
}

function resolvePath(stateFilePath: string): string {
  return resolve(process.cwd(), stateFilePath);
}

function symbolFileName(symbol: string): string {
  return symbol.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function resolveSymbolStatePath(symbol: string, stateFilePath: string): string {
  const absoluteBasePath = resolvePath(stateFilePath);
  const extension = extname(absoluteBasePath);

  if (!extension) {
    return join(absoluteBasePath, `${symbolFileName(symbol)}.json`);
  }

  const baseDirectory = dirname(absoluteBasePath);
  const fileName = absoluteBasePath.slice(baseDirectory.length + 1, -extension.length);
  return join(baseDirectory, `${fileName}.${symbolFileName(symbol)}${extension}`);
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

async function loadLegacyTradingState(
  symbol: string,
  config: TradingStoreConfig
): Promise<TradingState | null> {
  if (!config.legacyStateFilePath) {
    return null;
  }

  const filePath = resolveSymbolStatePath(symbol, config.legacyStateFilePath);

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as TradingState;

    if (parsed.symbol !== symbol || parsed.mode !== config.mode) {
      return null;
    }

    return {
      ...parsed,
      dca: {
        ...initialState(symbol, config).dca,
        ...parsed.dca
      },
      tradeHistory: parsed.tradeHistory ?? []
    };
  } catch {
    return null;
  }
}

export async function loadTradingState(
  symbol: string,
  config: TradingStoreConfig
): Promise<TradingState> {
  return withDatabaseClient(config.databaseUrl, async (client) => {
    const stateResult = await client.query<{
      active_strategy: TradingState["activeStrategy"];
      balances: TradingState["balances"];
      dca: TradingState["dca"];
      last_updated: string | Date;
    }>(
      `
        SELECT active_strategy, balances, dca, last_updated
        FROM trading_states
        WHERE symbol = $1 AND mode = $2
      `,
      [symbol, config.mode]
    );

    if (stateResult.rowCount === 0) {
      return (await loadLegacyTradingState(symbol, config)) ?? initialState(symbol, config);
    }

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
      [symbol, config.mode, config.maxTradeHistory]
    );

    const row = stateResult.rows[0];

    return {
      symbol,
      mode: config.mode,
      activeStrategy: row.active_strategy,
      balances: row.balances,
      dca: {
        ...initialState(symbol, config).dca,
        ...row.dca
      },
      tradeHistory: tradeHistoryResult.rows.map(mapTradeExecution).reverse(),
      lastUpdated: normalizeTimestamp(row.last_updated)
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
          INSERT INTO trading_states (symbol, mode, active_strategy, balances, dca, last_updated)
          VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
          ON CONFLICT (symbol, mode)
          DO UPDATE SET
            active_strategy = EXCLUDED.active_strategy,
            balances = EXCLUDED.balances,
            dca = EXCLUDED.dca,
            last_updated = EXCLUDED.last_updated
        `,
        [
          state.symbol,
          state.mode,
          state.activeStrategy,
          JSON.stringify(state.balances),
          JSON.stringify(state.dca),
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