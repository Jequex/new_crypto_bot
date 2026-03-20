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

export const config = {
  exchangeId: process.env.EXCHANGE_ID ?? "binance",
  symbol: process.env.SYMBOL ?? "BTC/USDT",
  symbols: readList("SYMBOLS", process.env.SYMBOL ? [process.env.SYMBOL] : ["BTC/USDT"]),
  interval: process.env.INTERVAL ?? "1h",
  confirmationIntervals: readList("CONFIRMATION_INTERVALS", ["4h", "1d"]),
  lookbackLimit: readNumber("LOOKBACK_LIMIT", 250),
  analysisIntervalMs: readNumber("ANALYSIS_INTERVAL_MS", 5 * 60 * 1000),
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
    databaseUrl: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/trading_bot",
    minConfidence: readNumber("TRADING_MIN_CONFIDENCE", 0.62),
    initialQuoteBalance: readNumber("INITIAL_QUOTE_BALANCE", 10000),
    initialBaseBalance: readNumber("INITIAL_BASE_BALANCE", 0),
    feeRate: readNumber("TRADING_FEE_RATE", 0.001),
    maxTradeHistory: readNumber("MAX_TRADE_HISTORY", 200),
    closeOnBear: readBoolean("CLOSE_ON_BEAR", true),
    dca: {
      trancheQuote: readNumber("DCA_TRANCHE_QUOTE", 250),
      maxEntries: readNumber("DCA_MAX_ENTRIES", 5),
      stepPercent: readNumber("DCA_STEP_PERCENT", 0.02),
      takeProfitPercent: readNumber("DCA_TAKE_PROFIT_PERCENT", 0.04),
      trailingTakeProfitEnabled: readBoolean("DCA_TRAILING_TAKE_PROFIT_ENABLED", true),
      trailingStopPercent: readNumber("DCA_TRAILING_STOP_PERCENT", 0.015),
      stopLossPercent: readNumber("DCA_STOP_LOSS_PERCENT", 0.05)
    }
  }
};