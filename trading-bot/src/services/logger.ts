import { withDatabaseClient } from "./database";

export type BotLogLevel = "info" | "warn" | "error";

export interface BotLogEntry {
  id: number;
  level: BotLogLevel;
  source: string;
  symbol?: string;
  message: string;
  details?: unknown;
  createdAt: string;
}

export interface BotLogFilters {
  page: number;
  pageSize: number;
  level?: BotLogLevel;
  source?: string;
  symbol?: string;
  date?: string;
}

export async function logEvent(
  databaseUrl: string,
  input: {
    level: BotLogLevel;
    source: string;
    symbol?: string;
    message: string;
    details?: unknown;
  }
): Promise<void> {
  await withDatabaseClient(databaseUrl, async (client) => {
    await client.query(
      `
        INSERT INTO bot_logs (level, source, symbol, message, details)
        VALUES ($1, $2, $3, $4, $5::jsonb)
      `,
      [input.level, input.source, input.symbol ?? null, input.message, JSON.stringify(input.details ?? null)]
    );
  });
}

export async function listBotLogs(
  databaseUrl: string,
  filters: BotLogFilters
): Promise<{ items: BotLogEntry[]; total: number; page: number; pageSize: number }> {
  return withDatabaseClient(databaseUrl, async (client) => {
    const clauses: string[] = [];
    const values: Array<string | number> = [];

    if (filters.level) {
      values.push(filters.level);
      clauses.push(`level = $${values.length}`);
    }

    if (filters.source) {
      values.push(filters.source);
      clauses.push(`source = $${values.length}`);
    }

    if (filters.symbol) {
      values.push(filters.symbol);
      clauses.push(`symbol = $${values.length}`);
    }

    if (filters.date) {
      const startDate = new Date(`${filters.date}T00:00:00.000Z`);

      if (Number.isNaN(startDate.getTime())) {
        throw new Error("date must be a valid YYYY-MM-DD value.");
      }

      const endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + 1);

      values.push(startDate.toISOString());
      clauses.push(`created_at >= $${values.length}`);
      values.push(endDate.toISOString());
      clauses.push(`created_at < $${values.length}`);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const countResult = await client.query<{ total: string }>(
      `
        SELECT COUNT(*)::text AS total
        FROM bot_logs
        ${whereClause}
      `,
      values
    );

    const offset = (filters.page - 1) * filters.pageSize;
    const pagedValues = [...values, filters.pageSize, offset];
    const rows = await client.query<{
      id: string;
      level: BotLogLevel;
      source: string;
      symbol: string | null;
      message: string;
      details: unknown;
      created_at: string | Date;
    }>(
      `
        SELECT id::text, level, source, symbol, message, details, created_at
        FROM bot_logs
        ${whereClause}
        ORDER BY created_at DESC, id DESC
        LIMIT $${pagedValues.length - 1}
        OFFSET $${pagedValues.length}
      `,
      pagedValues
    );

    return {
      items: rows.rows.map((row) => ({
        id: Number(row.id),
        level: row.level,
        source: row.source,
        symbol: row.symbol ?? undefined,
        message: row.message,
        details: row.details ?? undefined,
        createdAt: new Date(row.created_at).toISOString()
      })),
      total: Number(countResult.rows[0]?.total ?? 0),
      page: filters.page,
      pageSize: filters.pageSize
    };
  });
}