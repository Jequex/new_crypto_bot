import { LogsQuery, LogsResponse, RuntimeConfig, RuntimeConfigUpdate, TradesResponse, TradingStateSummary } from "./types";

const apiBaseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:3100";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export function fetchTradingStates(): Promise<TradingStateSummary[]> {
  return requestJson<TradingStateSummary[]>("/api/trading-states");
}

export function fetchRuntimeConfig(): Promise<RuntimeConfig> {
  return requestJson<RuntimeConfig>("/api/runtime-config");
}

export function saveRuntimeConfig(payload: RuntimeConfigUpdate): Promise<RuntimeConfig> {
  return requestJson<RuntimeConfig>("/api/runtime-config", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export function fetchTrades(symbol: string, page: number, pageSize: number): Promise<TradesResponse> {
  const params = new URLSearchParams({
    symbol,
    page: String(page),
    pageSize: String(pageSize)
  });

  return requestJson<TradesResponse>(`/api/trades?${params.toString()}`);
}

export function fetchLogs(query: LogsQuery): Promise<LogsResponse> {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize)
  });

  if (query.level) {
    params.set("level", query.level);
  }

  if (query.source) {
    params.set("source", query.source);
  }

  if (query.symbol) {
    params.set("symbol", query.symbol);
  }

  if (query.date) {
    params.set("date", query.date);
  }

  return requestJson<LogsResponse>(`/api/logs?${params.toString()}`);
}