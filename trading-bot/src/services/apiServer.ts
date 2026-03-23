import { createServer, IncomingMessage, ServerResponse } from "http";

import { loadConfig } from "../config";
import {
  RankingConfigUpdate,
  RuntimeConfigUpdate,
  loadLatestRankingSnapshot,
  loadRankingConfig,
  loadRuntimeConfig,
  updateRankingConfig,
  updateRuntimeConfig
} from "./database";
import { BotLogLevel, listBotLogs, logEvent } from "./logger";
import { listTradeExecutions, listTradingStates } from "./tradingStateStore";
import { TradingMode } from "../types";

type TradingStateApiResponse = Awaited<ReturnType<typeof listTradingStates>>[number];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, PATCH, PUT, OPTIONS"
};

function persistLog(databaseUrl: string, payload: Parameters<typeof logEvent>[1]): Promise<void> {
  return logEvent(databaseUrl, payload).catch(() => undefined);
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendError(response: ServerResponse, statusCode: number, message: string): void {
  sendJson(response, statusCode, { error: message });
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function parseMode(value: string | null): TradingMode | undefined {
  if (value === "paper" || value === "live") {
    return value;
  }

  return undefined;
}

function parseLogLevel(value: string | null): BotLogLevel | undefined {
  if (value === "info" || value === "warn" || value === "error") {
    return value;
  }

  return undefined;
}

function parsePositiveNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive number.`);
  }

  return value;
}

function toTradingStateSummary(state: TradingStateApiResponse): Omit<TradingStateApiResponse, "tradeHistory"> {
  const { tradeHistory: _tradeHistory, ...summary } = state;
  return summary;
}

function parseString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return value.trim();
}

function parseStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new Error(`${fieldName} must be an array of non-empty strings.`);
  }

  return value.map((item) => item.trim());
}

function parseRuntimeConfigUpdate(payload: unknown): RuntimeConfigUpdate {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Request body must be a JSON object.");
  }

  const body = payload as Record<string, unknown>;
  const update: RuntimeConfigUpdate = {};
  const allowedKeys = new Set([
    "exchangeId",
    "symbol",
    "symbols",
    "interval",
    "confirmationIntervals",
    "analysisIntervalMs",
    "initialQuoteBalance",
    "dcaTrancheQuote"
  ]);

  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unsupported runtime config field: ${key}.`);
    }
  }

  if (body.exchangeId !== undefined) {
    update.exchangeId = parseString(body.exchangeId, "exchangeId");
  }

  if (body.symbol !== undefined) {
    update.symbol = parseString(body.symbol, "symbol");
  }

  if (body.symbols !== undefined) {
    update.symbols = parseStringArray(body.symbols, "symbols");
  }

  if (body.interval !== undefined) {
    update.interval = parseString(body.interval, "interval");
  }

  if (body.confirmationIntervals !== undefined) {
    update.confirmationIntervals = parseStringArray(body.confirmationIntervals, "confirmationIntervals");
  }

  if (body.analysisIntervalMs !== undefined) {
    update.analysisIntervalMs = parsePositiveNumber(body.analysisIntervalMs, "analysisIntervalMs");
  }

  if (body.initialQuoteBalance !== undefined) {
    update.initialQuoteBalance = parsePositiveNumber(body.initialQuoteBalance, "initialQuoteBalance");
  }

  if (body.dcaTrancheQuote !== undefined) {
    update.dcaTrancheQuote = parsePositiveNumber(body.dcaTrancheQuote, "dcaTrancheQuote");
  }

  if (Object.keys(update).length === 0) {
    throw new Error("At least one runtime config field must be provided.");
  }

  return update;
}

function parseRankingConfigUpdate(payload: unknown): RankingConfigUpdate {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Request body must be a JSON object.");
  }

  const body = payload as Record<string, unknown>;
  const update: RankingConfigUpdate = {};
  const allowedKeys = new Set(["exchangeId", "rankingIntervals"]);

  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unsupported ranking config field: ${key}.`);
    }
  }

  if (body.exchangeId !== undefined) {
    update.exchangeId = parseString(body.exchangeId, "exchangeId");
  }

  if (body.rankingIntervals !== undefined) {
    update.rankingIntervals = parseStringArray(body.rankingIntervals, "rankingIntervals");
  }

  if (Object.keys(update).length === 0) {
    throw new Error("At least one ranking config field must be provided.");
  }

  return update;
}

export async function startApiServer(databaseUrl: string, port: number): Promise<void> {
  const server = createServer(async (request, response) => {
    try {
      if (!request.url || !request.method) {
        sendError(response, 400, "Invalid request.");
        return;
      }

      const url = new URL(request.url, "http://localhost");
      const path = url.pathname;

      if (request.method === "OPTIONS") {
        response.writeHead(204, corsHeaders);
        response.end();
        return;
      }

      if (request.method === "GET" && path === "/health") {
        sendJson(response, 200, { status: "ok" });
        return;
      }

      if (request.method === "GET" && path === "/api/runtime-config") {
        sendJson(response, 200, await loadRuntimeConfig(databaseUrl));
        return;
      }

      if (request.method === "GET" && path === "/api/ranking-config") {
        sendJson(response, 200, await loadRankingConfig(databaseUrl));
        return;
      }

      if (request.method === "GET" && path === "/api/rankings") {
        sendJson(response, 200, await loadLatestRankingSnapshot(databaseUrl));
        return;
      }

      if ((request.method === "PATCH" || request.method === "PUT") && path === "/api/runtime-config") {
        const body = await readJsonBody(request);
        const updatedConfig = await updateRuntimeConfig(databaseUrl, parseRuntimeConfigUpdate(body));
        sendJson(response, 200, updatedConfig);
        return;
      }

      if ((request.method === "PATCH" || request.method === "PUT") && path === "/api/ranking-config") {
        const body = await readJsonBody(request);
        const updatedConfig = await updateRankingConfig(databaseUrl, parseRankingConfigUpdate(body));
        sendJson(response, 200, updatedConfig);
        return;
      }

      if (request.method === "GET" && path === "/api/trading-states") {
        const config = await loadConfig(databaseUrl);
        const mode = parseMode(url.searchParams.get("mode"));
        const tradingStates = await listTradingStates(
          {
            mode: config.trading.mode,
            databaseUrl,
            initialQuoteBalance: config.trading.initialQuoteBalance,
            initialBaseBalance: config.trading.initialBaseBalance,
            maxTradeHistory: config.trading.maxTradeHistory
          },
          { mode }
        );

        sendJson(response, 200, tradingStates.map(toTradingStateSummary));
        return;
      }

      if (request.method === "GET" && path.startsWith("/api/trading-states/")) {
        const symbol = decodeURIComponent(path.slice("/api/trading-states/".length));
        const mode = parseMode(url.searchParams.get("mode"));
        const config = await loadConfig(databaseUrl);
        const tradingStates = await listTradingStates(
          {
            mode: mode ?? config.trading.mode,
            databaseUrl,
            initialQuoteBalance: config.trading.initialQuoteBalance,
            initialBaseBalance: config.trading.initialBaseBalance,
            maxTradeHistory: config.trading.maxTradeHistory
          },
          { symbol, mode }
        );

        if (tradingStates.length === 0) {
          sendError(response, 404, `Trading state not found for symbol ${symbol}.`);
          return;
        }

        sendJson(response, 200, toTradingStateSummary(tradingStates[0]));
        return;
      }

      if (request.method === "GET" && path === "/api/trades") {
        const mode = parseMode(url.searchParams.get("mode"));
        const symbol = url.searchParams.get("symbol");
        const rawPage = url.searchParams.get("page");
        const rawPageSize = url.searchParams.get("pageSize");
        const page = rawPage ? Number(rawPage) : 1;
        const pageSize = rawPageSize ? Number(rawPageSize) : 50;

        if (!symbol || symbol.trim().length === 0) {
          sendError(response, 400, "symbol query parameter is required.");
          return;
        }

        if (!Number.isInteger(page) || page <= 0) {
          sendError(response, 400, "page must be a positive integer.");
          return;
        }

        if (!Number.isInteger(pageSize) || pageSize <= 0 || pageSize > 200) {
          sendError(response, 400, "pageSize must be a positive integer between 1 and 200.");
          return;
        }

        sendJson(
          response,
          200,
          await listTradeExecutions(databaseUrl, { mode, symbol: symbol.trim(), page, pageSize })
        );
        return;
      }

      if (request.method === "GET" && path === "/api/logs") {
        const level = parseLogLevel(url.searchParams.get("level"));
        const source = url.searchParams.get("source")?.trim() || undefined;
        const symbol = url.searchParams.get("symbol")?.trim() || undefined;
        const date = url.searchParams.get("date")?.trim() || undefined;
        const rawPage = url.searchParams.get("page");
        const rawPageSize = url.searchParams.get("pageSize");
        const page = rawPage ? Number(rawPage) : 1;
        const pageSize = rawPageSize ? Number(rawPageSize) : 50;

        if (!Number.isInteger(page) || page <= 0) {
          sendError(response, 400, "page must be a positive integer.");
          return;
        }

        if (!Number.isInteger(pageSize) || pageSize <= 0 || pageSize > 200) {
          sendError(response, 400, "pageSize must be a positive integer between 1 and 200.");
          return;
        }

        sendJson(response, 200, await listBotLogs(databaseUrl, { level, source, symbol, date, page, pageSize }));
        return;
      }

      sendError(response, 404, "Route not found.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown server error.";
      await persistLog(databaseUrl, {
        level: "error",
        source: "api",
        message: "API request failed.",
        details: {
          method: request.method,
          url: request.url,
          error: message
        }
      });
      sendError(response, 500, message);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      void persistLog(databaseUrl, {
        level: "info",
        source: "api",
        message: "API server started.",
        details: {
          timestamp: new Date().toISOString(),
          apiPort: port
        }
      });
      resolve();
    });
  });
}