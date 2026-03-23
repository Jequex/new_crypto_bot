import dotenv from "dotenv";

import { loadRuntimeConfig, RuntimeConfigValues } from "./services/database";

dotenv.config();

export interface AppConfig {
  exchangeId: string;
  symbol: string;
  symbols: string[];
  interval: string;
  confirmationIntervals: string[];
  lookbackLimit: number;
  analysisIntervalMs: number;
  thresholds: {
    adxTrend: number;
    emaSlope: number;
    emaSpread: number;
    sidewaysAtr: number;
    volumeTrend: number;
    volumeSideways: number;
  };
  aiStrategy: {
    enabled: boolean;
    epochs: number;
    lookaheadCandles: number;
    returnThreshold: number;
  };
  trading: {
    enabled: boolean;
    mode: "paper" | "live";
    databaseUrl: string;
    minConfidence: number;
    initialQuoteBalance: number;
    initialBaseBalance: number;
    feeRate: number;
    maxTradeHistory: number;
    closeOnBear: boolean;
    dca: {
      trancheQuote: number;
      maxEntries: number;
      takeProfitPercent: number;
      trailingTakeProfitEnabled: boolean;
      trailingStopPercent: number;
      stopLossPercent: number;
    };
    grid: {
      trancheQuote: number;
      maxLevels: number;
      spacingPercent: number;
      takeProfitPercent: number;
      stopLossPercent: number;
      trailingTakeProfitEnabled: boolean;
      trailingTakeProfitStopPercent: number;
      trailingStopLossEnabled: boolean;
      trailingStopLossPercent: number;
    };
  };
}

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

function readBoolean(name: string, fallback: boolean): boolean {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  return rawValue.toLowerCase() === "true";
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

function readTradingMode(name: string, fallback: "paper" | "live"): "paper" | "live" {
  const rawValue = process.env[name];

  if (rawValue === "paper" || rawValue === "live") {
    return rawValue;
  }

  return fallback;
}

export function getDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/trading_bot";
}

export function getApiPort(): number {
  return readNumber("API_PORT", 3100);
}

export function getRuntimeConfigSeed(): RuntimeConfigValues {
  const symbol = process.env.SYMBOL ?? "BTC/USDT";
  const confirmationIntervals = readList("CONFIRMATION_INTERVALS", ["4h", "1d"]);

  return {
    exchangeId: process.env.EXCHANGE_ID ?? "binance",
    symbol,
    symbols: readList("SYMBOLS", [symbol]),
    interval: process.env.INTERVAL ?? "1h",
    confirmationIntervals,
    rankingIntervals: readList("RANKING_INTERVALS", [process.env.INTERVAL ?? "1h", ...confirmationIntervals]),
    analysisIntervalMs: readNumber("ANALYSIS_INTERVAL_MS", 5 * 60 * 1000),
    initialQuoteBalance: readNumber("INITIAL_QUOTE_BALANCE", 10000),
    dcaTrancheQuote: readNumber("DCA_TRANCHE_QUOTE", 250)
  };
}

const staticConfig = {
  lookbackLimit: readNumber("LOOKBACK_LIMIT", 250),
  thresholds: {
    adxTrend: readNumber("ADX_TREND_THRESHOLD", 20),
    emaSlope: readNumber("EMA_SLOPE_THRESHOLD", 0.0015),
    emaSpread: readNumber("EMA_SPREAD_THRESHOLD", 0.0025),
    sidewaysAtr: readNumber("SIDEWAYS_ATR_THRESHOLD", 0.012),
    volumeTrend: readNumber("VOLUME_TREND_THRESHOLD", 1.15),
    volumeSideways: readNumber("VOLUME_SIDEWAYS_THRESHOLD", 0.9)
  },
  aiStrategy: {
    enabled: readBoolean("AI_ENABLED", true),
    epochs: readNumber("AI_EPOCHS", 18),
    lookaheadCandles: readNumber("AI_LOOKAHEAD_CANDLES", 3),
    returnThreshold: readNumber("AI_RETURN_THRESHOLD", 0.006)
  },
  trading: {
    enabled: readBoolean("TRADING_ENABLED", true),
    mode: readTradingMode("TRADING_MODE", "paper"),
    minConfidence: readNumber("TRADING_MIN_CONFIDENCE", 0.62),
    initialBaseBalance: readNumber("INITIAL_BASE_BALANCE", 0),
    feeRate: readNumber("TRADING_FEE_RATE", 0.001),
    maxTradeHistory: readNumber("MAX_TRADE_HISTORY", 200),
    closeOnBear: readBoolean("CLOSE_ON_BEAR", true),
    dca: {
      maxEntries: readNumber("DCA_MAX_ENTRIES", 5),
      takeProfitPercent: readNumber("DCA_TAKE_PROFIT_PERCENT", 0.04),
      trailingTakeProfitEnabled: readBoolean("DCA_TRAILING_TAKE_PROFIT_ENABLED", true),
      trailingStopPercent: readNumber("DCA_TRAILING_STOP_PERCENT", 0.015),
      stopLossPercent: readNumber("DCA_STOP_LOSS_PERCENT", 0.05)
    },
    grid: {
      trancheQuote: readNumber("GRID_TRANCHE_QUOTE", 150),
      maxLevels: readNumber("GRID_MAX_LEVELS", 6),
      spacingPercent: readNumber("GRID_SPACING_PERCENT", 0.015),
      takeProfitPercent: readNumber("GRID_TAKE_PROFIT_PERCENT", 0.012),
      stopLossPercent: readNumber("GRID_STOP_LOSS_PERCENT", 0.05),
      trailingTakeProfitEnabled: readBoolean("GRID_TRAILING_TAKE_PROFIT_ENABLED", true),
      trailingTakeProfitStopPercent: readNumber("GRID_TRAILING_TAKE_PROFIT_STOP_PERCENT", 0.008),
      trailingStopLossEnabled: readBoolean("GRID_TRAILING_STOP_LOSS_ENABLED", true),
      trailingStopLossPercent: readNumber("GRID_TRAILING_STOP_LOSS_PERCENT", 0.03)
    }
  }
};

export async function loadConfig(databaseUrl = getDatabaseUrl()): Promise<AppConfig> {
  const runtimeConfig = await loadRuntimeConfig(databaseUrl);
  const symbols = runtimeConfig.symbols.length > 0 ? runtimeConfig.symbols : [runtimeConfig.symbol];

  return {
    exchangeId: runtimeConfig.exchangeId,
    symbol: runtimeConfig.symbol,
    symbols,
    interval: runtimeConfig.interval,
    confirmationIntervals: runtimeConfig.confirmationIntervals,
    lookbackLimit: staticConfig.lookbackLimit,
    analysisIntervalMs: runtimeConfig.analysisIntervalMs,
    thresholds: staticConfig.thresholds,
    aiStrategy: staticConfig.aiStrategy,
    trading: {
      enabled: staticConfig.trading.enabled,
      mode: staticConfig.trading.mode,
      databaseUrl,
      minConfidence: staticConfig.trading.minConfidence,
      initialQuoteBalance: runtimeConfig.initialQuoteBalance,
      initialBaseBalance: staticConfig.trading.initialBaseBalance,
      feeRate: staticConfig.trading.feeRate,
      maxTradeHistory: staticConfig.trading.maxTradeHistory,
      closeOnBear: staticConfig.trading.closeOnBear,
      dca: {
        trancheQuote: runtimeConfig.dcaTrancheQuote,
        maxEntries: staticConfig.trading.dca.maxEntries,
        takeProfitPercent: staticConfig.trading.dca.takeProfitPercent,
        trailingTakeProfitEnabled: staticConfig.trading.dca.trailingTakeProfitEnabled,
        trailingStopPercent: staticConfig.trading.dca.trailingStopPercent,
        stopLossPercent: staticConfig.trading.dca.stopLossPercent
      },
      grid: staticConfig.trading.grid
    }
  };
}