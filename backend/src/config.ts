import dotenv from "dotenv";

dotenv.config();

function readNumber(name: string, fallback: number): number {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number(rawValue);
  if (Number.isNaN(parsedValue)) {
    throw new Error(`Environment variable ${name} must be a number.`);
  }

  return parsedValue;
}

function readList(name: string, fallback: string[]): string[] {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  return rawValue
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export const config = {
  exchangeId: process.env.EXCHANGE_ID ?? "binance",
  symbol: process.env.SYMBOL ?? "BTC/USDT",
  interval: process.env.INTERVAL ?? "1h",
  confirmationIntervals: readList("CONFIRMATION_INTERVALS", ["4h", "1d"]),
  lookbackLimit: readNumber("LOOKBACK_LIMIT", 250),
  analysisIntervalMs: readNumber("ANALYSIS_INTERVAL_MS", 5 * 60 * 1000),
  thresholds: {
    adxTrend: readNumber("ADX_TREND_THRESHOLD", 20),
    emaSlope: readNumber("EMA_SLOPE_THRESHOLD", 0.0015),
    emaSpread: readNumber("EMA_SPREAD_THRESHOLD", 0.0025),
    sidewaysAtr: readNumber("SIDEWAYS_ATR_THRESHOLD", 0.012)
  }
};