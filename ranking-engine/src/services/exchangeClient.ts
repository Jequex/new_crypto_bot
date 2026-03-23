import ccxt from "ccxt";
import type { Exchange, Market, OHLCV } from "ccxt";

import { Candle } from "../types";

type ExchangeConstructor = new (options?: Record<string, unknown>) => Exchange;
type ExchangeMarket = NonNullable<Market>;

let exchangeInstance: Exchange | undefined;

function getRequestTimeoutMs(): number {
  const rawValue = process.env.EXCHANGE_TIMEOUT_MS;

  if (!rawValue) {
    return 30000;
  }

  const parsedValue = Number(rawValue);
  if (Number.isNaN(parsedValue)) {
    throw new Error("Environment variable EXCHANGE_TIMEOUT_MS must be a number.");
  }

  return parsedValue;
}

function getRetryCount(): number {
  const rawValue = process.env.EXCHANGE_RETRY_COUNT;

  if (!rawValue) {
    return 2;
  }

  const parsedValue = Number(rawValue);
  if (Number.isNaN(parsedValue)) {
    throw new Error("Environment variable EXCHANGE_RETRY_COUNT must be a number.");
  }

  return Math.max(0, parsedValue);
}

function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return (
    message.includes("timed out") ||
    message.includes("networkerror") ||
    message.includes("econnreset") ||
    message.includes("socket hang up")
  );
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  const retryCount = getRetryCount();
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === retryCount || !isRetryableError(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}

function createExchange(exchangeId: string): Exchange {
  const exchangeRegistry = ccxt as unknown as Record<string, ExchangeConstructor>;
  const ExchangeClass = exchangeRegistry[exchangeId];

  if (!ExchangeClass) {
    throw new Error(`Unsupported exchange: ${exchangeId}`);
  }

  return new ExchangeClass({
    enableRateLimit: true,
    timeout: getRequestTimeoutMs(),
    apiKey: process.env.EXCHANGE_API_KEY,
    secret: process.env.EXCHANGE_API_SECRET,
    password: process.env.EXCHANGE_API_PASSWORD
  });
}

function getExchange(exchangeId: string): Exchange {
  if (!exchangeInstance || exchangeInstance.id !== exchangeId) {
    exchangeInstance = createExchange(exchangeId);
  }

  return exchangeInstance;
}

function isDefinedMarket(market: Market | undefined): market is ExchangeMarket {
  return market !== undefined;
}

function hasSymbol(market: ExchangeMarket): market is ExchangeMarket & { symbol: string } {
  return typeof market.symbol === "string" && market.symbol.length > 0;
}

function isSpotMarket(market: ExchangeMarket): boolean {
  if (typeof market.spot === "boolean") {
    return market.spot;
  }

  return market.type === "spot" || market.type === undefined;
}

export async function loadSymbols(exchangeId: string, quoteCurrencies: string[]): Promise<string[]> {
  const exchange = getExchange(exchangeId);
  const markets = await withRetry(() => exchange.loadMarkets());
  const normalizedQuotes = new Set(quoteCurrencies.map((value) => value.toUpperCase()));

  return Object.values(markets)
    .filter(isDefinedMarket)
    .filter(hasSymbol)
    .filter((market) => market.active !== false)
    .filter(isSpotMarket)
    .filter((market) => {
      if (normalizedQuotes.size === 0) {
        return true;
      }

      return market.quote ? normalizedQuotes.has(market.quote.toUpperCase()) : false;
    })
    .map((market) => market.symbol)
    .sort((left, right) => left.localeCompare(right));
}

export async function fetchCandles(
  exchangeId: string,
  symbol: string,
  interval: string,
  limit: number
): Promise<Candle[]> {
  const exchange = getExchange(exchangeId);
  const ohlcv = await withRetry(() => exchange.fetchOHLCV(symbol, interval, undefined, limit));

  return ohlcv.map((entry: OHLCV) => ({
    openTime: Number(entry[0]),
    open: Number(entry[1]),
    high: Number(entry[2]),
    low: Number(entry[3]),
    close: Number(entry[4]),
    volume: Number(entry[5]),
    closeTime: Number(entry[0])
  }));
}