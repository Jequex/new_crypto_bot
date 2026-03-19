import ccxt from "ccxt";
import type { Exchange, OHLCV } from "ccxt";

import { Candle, OrderSide } from "../types";

type ExchangeConstructor = new (options?: Record<string, unknown>) => Exchange;

let exchangeInstance: Exchange | undefined;

function createExchange(exchangeId: string): Exchange {
  const exchangeRegistry = ccxt as unknown as Record<string, ExchangeConstructor>;
  const ExchangeClass = exchangeRegistry[exchangeId];

  if (!ExchangeClass) {
    throw new Error(`Unsupported exchange: ${exchangeId}`);
  }

  return new ExchangeClass({
    enableRateLimit: true,
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

export async function fetchCandles(
  exchangeId: string,
  symbol: string,
  interval: string,
  limit: number
): Promise<Candle[]> {
  const exchange = getExchange(exchangeId);
  const ohlcv = await exchange.fetchOHLCV(symbol, interval, undefined, limit);

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

export async function placeMarketOrder(
  exchangeId: string,
  symbol: string,
  side: OrderSide,
  amount: number
): Promise<unknown> {
  const exchange = getExchange(exchangeId);

  if (!process.env.EXCHANGE_API_KEY || !process.env.EXCHANGE_API_SECRET) {
    throw new Error("Live trading requires EXCHANGE_API_KEY and EXCHANGE_API_SECRET.");
  }

  await exchange.loadMarkets();
  return exchange.createOrder(symbol, "market", side, amount);
}