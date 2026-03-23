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
    CREATE TABLE IF NOT EXISTS ranking_runtime_config (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      exchange_id TEXT NOT NULL,
      ranking_intervals JSONB NOT NULL,
      ranking_concurrency INTEGER NOT NULL DEFAULT 4,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await getDatabasePool(databaseUrl).query(`
    ALTER TABLE ranking_runtime_config
    ADD COLUMN IF NOT EXISTS ranking_concurrency INTEGER;
  `);

  await getDatabasePool(databaseUrl).query(`
    UPDATE ranking_runtime_config
    SET ranking_concurrency = 4
    WHERE ranking_concurrency IS NULL OR ranking_concurrency <= 0;
  `);

  await getDatabasePool(databaseUrl).query(`
    ALTER TABLE ranking_runtime_config
    ALTER COLUMN ranking_concurrency SET NOT NULL;
  `);

  await getDatabasePool(databaseUrl).query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'bot_runtime_config'
          AND column_name = 'ranking_intervals'
      ) THEN
        EXECUTE '
          INSERT INTO ranking_runtime_config (id, exchange_id, ranking_intervals, ranking_concurrency)
          SELECT
            id,
            exchange_id,
            CASE
              WHEN ranking_intervals = ''[]''::jsonb THEN to_jsonb(ARRAY[
                interval,
                COALESCE(confirmation_intervals ->> 0, interval),
                COALESCE(confirmation_intervals ->> 1, interval)
              ])
              ELSE ranking_intervals
            END,
            4
          FROM bot_runtime_config
          WHERE id = 1
          ON CONFLICT (id) DO NOTHING
        ';
      END IF;
    END $$;
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
  rankingConcurrency: number;
}> {
  await ensureRankingIntervalsColumn(databaseUrl);

  const result = await getDatabasePool(databaseUrl).query<{
    exchange_id: string;
    ranking_intervals: unknown;
    ranking_concurrency: number;
  }>(`
    SELECT
      exchange_id,
      ranking_intervals,
      ranking_concurrency
    FROM ranking_runtime_config
    WHERE id = 1
  `);

  if (result.rowCount === 0) {
    throw new Error("Ranking config row was not found in ranking_runtime_config.");
  }

  const row = result.rows[0];

  return {
    exchangeId: row.exchange_id,
    rankingIntervals: toStringArray(row.ranking_intervals, ["15m", "1h", "4h", "1d"]),
    rankingConcurrency: Number(row.ranking_concurrency)
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