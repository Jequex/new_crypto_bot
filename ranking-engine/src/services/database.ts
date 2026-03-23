import { Pool } from "pg";

import { PairRanking } from "../types";

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

async function ensureRankingSnapshotsTable(databaseUrl: string): Promise<void> {
  await getDatabasePool(databaseUrl).query(`
    CREATE TABLE IF NOT EXISTS ranking_snapshots (
      id BIGSERIAL PRIMARY KEY,
      exchange_id TEXT NOT NULL,
      intervals JSONB NOT NULL,
      results JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await getDatabasePool(databaseUrl).query(`
    CREATE INDEX IF NOT EXISTS idx_ranking_snapshots_created_at
    ON ranking_snapshots (created_at DESC, id DESC);
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

export async function saveRankingSnapshot(
  databaseUrl: string,
  payload: {
    exchangeId: string;
    intervals: string[];
    rankings: PairRanking[];
  }
): Promise<number> {
  await ensureRankingSnapshotsTable(databaseUrl);

  const result = await getDatabasePool(databaseUrl).query<{ id: number | string }>(
    `
      INSERT INTO ranking_snapshots (exchange_id, intervals, results)
      VALUES ($1, $2::jsonb, $3::jsonb)
      RETURNING id
    `,
    [payload.exchangeId, JSON.stringify(payload.intervals), JSON.stringify(payload.rankings)]
  );

  return Number(result.rows[0]?.id ?? 0);
}