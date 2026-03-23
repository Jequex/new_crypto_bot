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

export type RuntimeConfigUpdate = Partial<RuntimeConfigValues>;

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

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function normalizeRuntimeConfig(values: RuntimeConfigValues): RuntimeConfigValues {
  const symbol = values.symbol.trim();
  const symbols = unique([symbol, ...values.symbols.map((value) => value.trim()).filter((value) => value.length > 0)]);
  const confirmationIntervals = unique(
    values.confirmationIntervals.map((value) => value.trim()).filter((value) => value.length > 0)
  );

  return {
    exchangeId: values.exchangeId.trim(),
    symbol,
    symbols,
    interval: values.interval.trim(),
    confirmationIntervals,
    analysisIntervalMs: values.analysisIntervalMs,
    initialQuoteBalance: values.initialQuoteBalance,
    dcaTrancheQuote: values.dcaTrancheQuote
  };
}

export async function initializeTradingDatabase(
  databaseUrl: string,
  runtimeConfig: RuntimeConfigValues
): Promise<void> {
  const databasePool = getDatabasePool(databaseUrl);
  const seedConfig = normalizeRuntimeConfig(runtimeConfig);

  await databasePool.query(`
    CREATE TABLE IF NOT EXISTS trading_states (
      symbol TEXT NOT NULL,
      mode TEXT NOT NULL,
      active_strategy TEXT NOT NULL,
      last_price DOUBLE PRECISION NOT NULL DEFAULT 0,
      balances JSONB NOT NULL,
      dca JSONB NOT NULL,
      grid JSONB NOT NULL DEFAULT '{}'::jsonb,
      last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (symbol, mode)
    );
  `);

  await databasePool.query(`
    ALTER TABLE trading_states
    ADD COLUMN IF NOT EXISTS last_price DOUBLE PRECISION NOT NULL DEFAULT 0;
  `);

  await databasePool.query(`
    ALTER TABLE trading_states
    ADD COLUMN IF NOT EXISTS grid JSONB NOT NULL DEFAULT '{}'::jsonb;
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
    CREATE TABLE IF NOT EXISTS bot_logs (
      id BIGSERIAL PRIMARY KEY,
      level TEXT NOT NULL,
      source TEXT NOT NULL,
      symbol TEXT,
      message TEXT NOT NULL,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await databasePool.query(`
    CREATE INDEX IF NOT EXISTS idx_bot_logs_created_at
    ON bot_logs (created_at DESC);
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
      seedConfig.exchangeId,
      seedConfig.symbol,
      JSON.stringify(seedConfig.symbols),
      seedConfig.interval,
      JSON.stringify(seedConfig.confirmationIntervals),
      seedConfig.analysisIntervalMs,
      seedConfig.initialQuoteBalance,
      seedConfig.dcaTrancheQuote
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

  return normalizeRuntimeConfig({
    exchangeId: row.exchange_id,
    symbol: row.symbol,
    symbols,
    interval: row.interval,
    confirmationIntervals: toStringArray(row.confirmation_intervals, ["4h", "1d"]),
    analysisIntervalMs: Number(row.analysis_interval_ms),
    initialQuoteBalance: Number(row.initial_quote_balance),
    dcaTrancheQuote: Number(row.dca_tranche_quote)
  });
}

export async function updateRuntimeConfig(
  databaseUrl: string,
  updates: RuntimeConfigUpdate
): Promise<RuntimeConfigValues> {
  const current = await loadRuntimeConfig(databaseUrl);
  const nextConfig = normalizeRuntimeConfig({
    ...current,
    ...updates,
    symbols: updates.symbols ?? current.symbols,
    confirmationIntervals: updates.confirmationIntervals ?? current.confirmationIntervals
  });

  await getDatabasePool(databaseUrl).query(
    `
      UPDATE bot_runtime_config
      SET
        exchange_id = $2,
        symbol = $3,
        symbols = $4::jsonb,
        interval = $5,
        confirmation_intervals = $6::jsonb,
        analysis_interval_ms = $7,
        initial_quote_balance = $8,
        dca_tranche_quote = $9,
        updated_at = NOW()
      WHERE id = $1
    `,
    [
      1,
      nextConfig.exchangeId,
      nextConfig.symbol,
      JSON.stringify(nextConfig.symbols),
      nextConfig.interval,
      JSON.stringify(nextConfig.confirmationIntervals),
      nextConfig.analysisIntervalMs,
      nextConfig.initialQuoteBalance,
      nextConfig.dcaTrancheQuote
    ]
  );

  return nextConfig;
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