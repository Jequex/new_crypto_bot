import { Pool, PoolClient } from "pg";

export interface RuntimeConfigValues {
  exchangeId: string;
  symbol: string;
  symbols: string[];
  interval: string;
  confirmationIntervals: string[];
  analysisIntervalMs: number;
  initialQuoteBalance: number;
  dcaTrancheQuote: number;
}

let pool: Pool | undefined;

function getDatabasePool(databaseUrl: string): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl
    });
  }

  return pool;
}

function toStringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  }

  return fallback;
}

export async function initializeTradingDatabase(
  databaseUrl: string,
  runtimeConfig: RuntimeConfigValues
): Promise<void> {
  const databasePool = getDatabasePool(databaseUrl);

  await databasePool.query(`
    CREATE TABLE IF NOT EXISTS trading_states (
      symbol TEXT NOT NULL,
      mode TEXT NOT NULL,
      active_strategy TEXT NOT NULL,
      balances JSONB NOT NULL,
      dca JSONB NOT NULL,
      last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (symbol, mode)
    );
  `);

  await databasePool.query(`
    CREATE TABLE IF NOT EXISTS trade_executions (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      mode TEXT NOT NULL,
      strategy TEXT NOT NULL,
      side TEXT NOT NULL,
      price DOUBLE PRECISION NOT NULL,
      entry_price DOUBLE PRECISION,
      stop_loss_price DOUBLE PRECISION,
      take_profit_price DOUBLE PRECISION,
      base_amount DOUBLE PRECISION NOT NULL,
      quote_amount DOUBLE PRECISION NOT NULL,
      fee_amount DOUBLE PRECISION NOT NULL,
      realized_pnl_quote DOUBLE PRECISION,
      realized_pnl_percent DOUBLE PRECISION,
      status TEXT NOT NULL,
      reason TEXT NOT NULL,
      note TEXT,
      timestamp TIMESTAMPTZ NOT NULL
    );
  `);

  await databasePool.query(`
    CREATE INDEX IF NOT EXISTS idx_trade_executions_symbol_mode_timestamp
    ON trade_executions (symbol, mode, timestamp DESC);
  `);

  await databasePool.query(`
    CREATE TABLE IF NOT EXISTS bot_runtime_config (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      exchange_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      symbols JSONB NOT NULL,
      interval TEXT NOT NULL,
      confirmation_intervals JSONB NOT NULL,
      analysis_interval_ms INTEGER NOT NULL,
      initial_quote_balance DOUBLE PRECISION NOT NULL,
      dca_tranche_quote DOUBLE PRECISION NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await databasePool.query(
    `
      INSERT INTO bot_runtime_config (
        id,
        exchange_id,
        symbol,
        symbols,
        interval,
        confirmation_intervals,
        analysis_interval_ms,
        initial_quote_balance,
        dca_tranche_quote
      )
      VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7, $8, $9)
      ON CONFLICT (id) DO NOTHING
    `,
    [
      1,
      runtimeConfig.exchangeId,
      runtimeConfig.symbol,
      JSON.stringify(runtimeConfig.symbols),
      runtimeConfig.interval,
      JSON.stringify(runtimeConfig.confirmationIntervals),
      runtimeConfig.analysisIntervalMs,
      runtimeConfig.initialQuoteBalance,
      runtimeConfig.dcaTrancheQuote
    ]
  );
}

export async function loadRuntimeConfig(databaseUrl: string): Promise<RuntimeConfigValues> {
  const result = await getDatabasePool(databaseUrl).query<{
    exchange_id: string;
    symbol: string;
    symbols: unknown;
    interval: string;
    confirmation_intervals: unknown;
    analysis_interval_ms: number;
    initial_quote_balance: number;
    dca_tranche_quote: number;
  }>(`
    SELECT
      exchange_id,
      symbol,
      symbols,
      interval,
      confirmation_intervals,
      analysis_interval_ms,
      initial_quote_balance,
      dca_tranche_quote
    FROM bot_runtime_config
    WHERE id = 1
  `);

  if (result.rowCount === 0) {
    throw new Error("Runtime config row was not found in bot_runtime_config.");
  }

  const row = result.rows[0];
  const symbols = toStringArray(row.symbols, [row.symbol]);

  return {
    exchangeId: row.exchange_id,
    symbol: row.symbol,
    symbols,
    interval: row.interval,
    confirmationIntervals: toStringArray(row.confirmation_intervals, ["4h", "1d"]),
    analysisIntervalMs: Number(row.analysis_interval_ms),
    initialQuoteBalance: Number(row.initial_quote_balance),
    dcaTrancheQuote: Number(row.dca_tranche_quote)
  };
}

export async function withDatabaseClient<T>(
  databaseUrl: string,
  action: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getDatabasePool(databaseUrl).connect();

  try {
    return await action(client);
  } finally {
    client.release();
  }
}