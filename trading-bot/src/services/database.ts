import { Pool, PoolClient } from "pg";

let pool: Pool | undefined;

function getDatabasePool(databaseUrl: string): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl
    });
  }

  return pool;
}

export async function initializeTradingDatabase(databaseUrl: string): Promise<void> {
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