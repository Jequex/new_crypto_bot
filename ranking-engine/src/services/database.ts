import { Pool } from "pg";

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
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }

  return fallback;
}

async function ensureRankingIntervalsColumn(databaseUrl: string): Promise<void> {
  await getDatabasePool(databaseUrl).query(`
    ALTER TABLE bot_runtime_config
    ADD COLUMN IF NOT EXISTS ranking_intervals JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);

  await getDatabasePool(databaseUrl).query(`
    UPDATE bot_runtime_config
    SET ranking_intervals = to_jsonb(ARRAY[
      interval,
      COALESCE(confirmation_intervals ->> 0, interval),
      COALESCE(confirmation_intervals ->> 1, interval)
    ])
    WHERE ranking_intervals = '[]'::jsonb;
  `);
}

export async function loadDatabaseRuntimeConfig(databaseUrl: string): Promise<{
  exchangeId: string;
  rankingIntervals: string[];
}> {
  await ensureRankingIntervalsColumn(databaseUrl);

  const result = await getDatabasePool(databaseUrl).query<{
    exchange_id: string;
    interval: string;
    confirmation_intervals: unknown;
    ranking_intervals: unknown;
  }>(`
    SELECT
      exchange_id,
      interval,
      confirmation_intervals,
      ranking_intervals
    FROM bot_runtime_config
    WHERE id = 1
  `);

  if (result.rowCount === 0) {
    throw new Error("Runtime config row was not found in bot_runtime_config.");
  }

  const row = result.rows[0];
  const confirmationIntervals = toStringArray(row.confirmation_intervals, ["4h", "1d"]);

  return {
    exchangeId: row.exchange_id,
    rankingIntervals: toStringArray(row.ranking_intervals, [row.interval, ...confirmationIntervals])
  };
}