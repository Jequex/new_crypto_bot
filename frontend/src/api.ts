import { TradesResponse, TradingStateSummary } from "./types";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export function fetchTradingStates(): Promise<TradingStateSummary[]> {
  return requestJson<TradingStateSummary[]>("/api/trading-states");
}

export function fetchTrades(symbol: string, page: number, pageSize: number): Promise<TradesResponse> {
  const params = new URLSearchParams({
    symbol,
    page: String(page),
    pageSize: String(pageSize)
  });

  return requestJson<TradesResponse>(`/api/trades?${params.toString()}`);
}