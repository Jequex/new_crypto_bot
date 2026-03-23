import dotenv from "dotenv";

import { RankingConfig } from "./types";

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

function readOptionalNumber(name: string): number | undefined {
  const rawValue = process.env[name];

  if (!rawValue) {
    return undefined;
  }

  const parsedValue = Number(rawValue);
  if (Number.isNaN(parsedValue)) {
    throw new Error(`Environment variable ${name} must be a number.`);
  }

  return parsedValue;
}

function readOutputFormat(): "table" | "json" {
  return process.env.OUTPUT_FORMAT === "json" ? "json" : "table";
}

export function loadConfig(): RankingConfig {
  return {
    exchangeId: process.env.EXCHANGE_ID ?? "binance",
    intervals: readList("RANKING_INTERVALS", ["15m", "1h", "4h", "1d"]),
    lookbackLimit: readNumber("LOOKBACK_LIMIT", 250),
    concurrency: readNumber("RANKING_CONCURRENCY", 4),
    quoteCurrencies: readList("QUOTE_CURRENCIES", []),
    maxPairs: readOptionalNumber("MAX_PAIRS"),
    outputFormat: readOutputFormat(),
    outputLimit: readOptionalNumber("OUTPUT_LIMIT"),
    thresholds: {
      adxTrend: readNumber("ADX_TREND_THRESHOLD", 20),
      emaSlope: readNumber("EMA_SLOPE_THRESHOLD", 0.0015),
      emaSpread: readNumber("EMA_SPREAD_THRESHOLD", 0.0025),
      sidewaysAtr: readNumber("SIDEWAYS_ATR_THRESHOLD", 0.012),
      volumeTrend: readNumber("VOLUME_TREND_THRESHOLD", 1.15),
      volumeSideways: readNumber("VOLUME_SIDEWAYS_THRESHOLD", 0.9)
    }
  };
}