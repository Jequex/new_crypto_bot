import { RuntimeConfig, RuntimeConfigUpdate, TradesResponse, TradingStateSummary } from "./types";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

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