import { ADX, ATR, EMA, RSI } from "technicalindicators";

import { Candle, MarketRegime, RegimeAnalysis } from "../types";

interface Thresholds {
  adxTrend: number;
  emaSlope: number;
  emaSpread: number;
  sidewaysAtr: number;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export function analyzeMarketRegime(
  candles: Candle[],
  symbol: string,
  interval: string,
  thresholds: Thresholds
): RegimeAnalysis {
  if (candles.length < 60) {
    throw new Error("At least 60 candles are required to classify the market regime.");
  }

  const closes = candles.map((candle) => candle.close);
  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);

  const ema20Series = EMA.calculate({ period: 20, values: closes });
  const ema50Series = EMA.calculate({ period: 50, values: closes });
  const adxSeries = ADX.calculate({
    period: 14,
    close: closes,
    high: highs,
    low: lows
  });
  const atrSeries = ATR.calculate({
    period: 14,
    close: closes,
    high: highs,
    low: lows
  });
  const rsiSeries = RSI.calculate({ period: 14, values: closes });

  const ema20 = ema20Series.at(-1);
  const previousEma20 = ema20Series.at(-6);
  const ema50 = ema50Series.at(-1);
  const adx = adxSeries.at(-1);
  const atr = atrSeries.at(-1);
  const rsi = rsiSeries.at(-1);
  const lastClose = closes.at(-1);

  if (
    ema20 === undefined ||
    previousEma20 === undefined ||
    ema50 === undefined ||
    adx === undefined ||
    atr === undefined ||
    rsi === undefined ||
    lastClose === undefined
  ) {
    throw new Error("Unable to compute one or more indicators from the current candle set.");
  }

  const ema20Slope = (ema20 - previousEma20) / previousEma20;
  const emaSpreadPercent = (ema20 - ema50) / ema50;
  const atrPercent = atr / lastClose;

  const bullScore =
    (ema20 > ema50 ? 1 : 0) +
    (ema20Slope > thresholds.emaSlope ? 1 : 0) +
    (adx.adx >= thresholds.adxTrend && adx.pdi > adx.mdi ? 1 : 0) +
    (emaSpreadPercent > thresholds.emaSpread ? 1 : 0) +
    (rsi > 55 ? 1 : 0);

  const bearScore =
    (ema20 < ema50 ? 1 : 0) +
    (ema20Slope < -thresholds.emaSlope ? 1 : 0) +
    (adx.adx >= thresholds.adxTrend && adx.mdi > adx.pdi ? 1 : 0) +
    (emaSpreadPercent < -thresholds.emaSpread ? 1 : 0) +
    (rsi < 45 ? 1 : 0);

  const sidewaysConditions =
    adx.adx < thresholds.adxTrend &&
    Math.abs(ema20Slope) < thresholds.emaSlope &&
    Math.abs(emaSpreadPercent) < thresholds.emaSpread &&
    atrPercent < thresholds.sidewaysAtr;

  let regime: MarketRegime = "sideways";
  let confidence = 0.5;
  const reasons: string[] = [];

  if (sidewaysConditions) {
    regime = "sideways";
    confidence = clamp(
      0.55 +
        (thresholds.adxTrend - adx.adx) / 100 +
        (thresholds.sidewaysAtr - atrPercent) * 5,
      0.5,
      0.95
    );
    reasons.push("Trend strength is weak based on ADX.");
    reasons.push("Short and medium EMAs are tightly clustered with limited slope.");
    reasons.push("Volatility is compressed relative to price.");
  } else if (bullScore > bearScore && bullScore >= 3) {
    regime = "bull";
    confidence = clamp(0.5 + bullScore * 0.08 + adx.adx / 100, 0.5, 0.99);
    reasons.push("EMA20 is above EMA50, indicating upward structure.");
    reasons.push("Short-term EMA slope is positive.");
    reasons.push("ADX confirms directional strength with positive DI leadership.");
    reasons.push("Momentum is constructive based on RSI.");
  } else if (bearScore > bullScore && bearScore >= 3) {
    regime = "bear";
    confidence = clamp(0.5 + bearScore * 0.08 + adx.adx / 100, 0.5, 0.99);
    reasons.push("EMA20 is below EMA50, indicating downward structure.");
    reasons.push("Short-term EMA slope is negative.");
    reasons.push("ADX confirms directional strength with negative DI leadership.");
    reasons.push("Momentum is weak based on RSI.");
  } else {
    regime = "sideways";
    confidence = clamp(0.5 + (1 - Math.abs(emaSpreadPercent)) * 0.1, 0.5, 0.8);
    reasons.push("Directional signals are mixed, so the market is treated as range-bound.");
  }

  return {
    symbol,
    interval,
    regime,
    timestamp: new Date().toISOString(),
    confidence: round(confidence),
    metrics: {
      lastClose: round(lastClose),
      ema20: round(ema20),
      ema50: round(ema50),
      ema20Slope: round(ema20Slope),
      emaSpreadPercent: round(emaSpreadPercent),
      adx: round(adx.adx),
      plusDI: round(adx.pdi),
      minusDI: round(adx.mdi),
      atrPercent: round(atrPercent),
      rsi: round(rsi)
    },
    reasons
  };
}