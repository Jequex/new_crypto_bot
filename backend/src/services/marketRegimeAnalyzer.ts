import { ADX, ATR, EMA, RSI, SMA } from "technicalindicators";

import { Candle, MarketRegime, RegimeAnalysis, TimeframeConfirmation } from "../types";
import { runAiStrategy } from "./aiStrategy";

interface Thresholds {
  adxTrend: number;
  emaSlope: number;
  emaSpread: number;
  sidewaysAtr: number;
  volumeTrend: number;
  volumeSideways: number;
}

interface AiStrategyConfig {
  enabled: boolean;
  epochs: number;
  lookaheadCandles: number;
  returnThreshold: number;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

interface BaseRegimeAnalysis {
  symbol: string;
  interval: string;
  regime: MarketRegime;
  confidence: number;
  metrics: RegimeAnalysis["metrics"];
  reasons: string[];
}

interface ConfirmationInput {
  interval: string;
  candles: Candle[];
}

function analyzeSingleTimeframe(
  candles: Candle[],
  symbol: string,
  interval: string,
  thresholds: Thresholds
): BaseRegimeAnalysis {
  if (candles.length < 60) {
    throw new Error("At least 60 candles are required to classify the market regime.");
  }

  const closes = candles.map((candle) => candle.close);
  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  const volumes = candles.map((candle) => candle.volume);

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
  const volumeSma20Series = SMA.calculate({ period: 20, values: volumes });

  const ema20 = ema20Series.at(-1);
  const previousEma20 = ema20Series.at(-6);
  const ema50 = ema50Series.at(-1);
  const adx = adxSeries.at(-1);
  const atr = atrSeries.at(-1);
  const rsi = rsiSeries.at(-1);
  const lastClose = closes.at(-1);
  const lastVolume = volumes.at(-1);
  const volumeSma20 = volumeSma20Series.at(-1);

  if (
    ema20 === undefined ||
    previousEma20 === undefined ||
    ema50 === undefined ||
    adx === undefined ||
    atr === undefined ||
    rsi === undefined ||
    lastClose === undefined ||
    lastVolume === undefined ||
    volumeSma20 === undefined
  ) {
    throw new Error("Unable to compute one or more indicators from the current candle set.");
  }

  const ema20Slope = (ema20 - previousEma20) / previousEma20;
  const emaSpreadPercent = (ema20 - ema50) / ema50;
  const atrPercent = atr / lastClose;
  const volumeRatio = volumeSma20 > 0 ? lastVolume / volumeSma20 : 1;
  const volumeTrendConfirmed = volumeRatio >= thresholds.volumeTrend;
  const volumeSidewaysConfirmed = volumeRatio <= thresholds.volumeSideways;

  const bullScore =
    (ema20 > ema50 ? 1 : 0) +
    (ema20Slope > thresholds.emaSlope ? 1 : 0) +
    (adx.adx >= thresholds.adxTrend && adx.pdi > adx.mdi ? 1 : 0) +
    (emaSpreadPercent > thresholds.emaSpread ? 1 : 0) +
    (rsi > 55 ? 1 : 0) +
    (volumeTrendConfirmed ? 1 : 0);

  const bearScore =
    (ema20 < ema50 ? 1 : 0) +
    (ema20Slope < -thresholds.emaSlope ? 1 : 0) +
    (adx.adx >= thresholds.adxTrend && adx.mdi > adx.pdi ? 1 : 0) +
    (emaSpreadPercent < -thresholds.emaSpread ? 1 : 0) +
    (rsi < 45 ? 1 : 0) +
    (volumeTrendConfirmed ? 1 : 0);

  const sidewaysConditions =
    adx.adx < thresholds.adxTrend &&
    Math.abs(ema20Slope) < thresholds.emaSlope &&
    Math.abs(emaSpreadPercent) < thresholds.emaSpread &&
    atrPercent < thresholds.sidewaysAtr &&
    volumeSidewaysConfirmed;

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
    reasons.push("Volume is below its 20-period average, which supports range conditions.");
  } else if (bullScore > bearScore && bullScore >= 3) {
    regime = "bull";
    confidence = clamp(0.5 + bullScore * 0.08 + adx.adx / 100, 0.5, 0.99);
    reasons.push("EMA20 is above EMA50, indicating upward structure.");
    reasons.push("Short-term EMA slope is positive.");
    reasons.push("ADX confirms directional strength with positive DI leadership.");
    reasons.push("Momentum is constructive based on RSI.");
    if (volumeTrendConfirmed) {
      reasons.push("Volume is expanding above its 20-period average, confirming participation.");
    }
  } else if (bearScore > bullScore && bearScore >= 3) {
    regime = "bear";
    confidence = clamp(0.5 + bearScore * 0.08 + adx.adx / 100, 0.5, 0.99);
    reasons.push("EMA20 is below EMA50, indicating downward structure.");
    reasons.push("Short-term EMA slope is negative.");
    reasons.push("ADX confirms directional strength with negative DI leadership.");
    reasons.push("Momentum is weak based on RSI.");
    if (volumeTrendConfirmed) {
      reasons.push("Volume is expanding above its 20-period average, confirming participation.");
    }
  } else {
    regime = "sideways";
    confidence = clamp(0.5 + (1 - Math.abs(emaSpreadPercent)) * 0.1, 0.5, 0.8);
    reasons.push("Directional signals are mixed, so the market is treated as range-bound.");
    if (!volumeTrendConfirmed) {
      reasons.push("Volume is not expanding enough to validate a directional breakout.");
    }
  }

  return {
    symbol,
    interval,
    regime,
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
      rsi: round(rsi),
      volumeSma20: round(volumeSma20),
      volumeRatio: round(volumeRatio)
    },
    reasons
  };
}

export async function analyzeMarketRegime(
  candles: Candle[],
  symbol: string,
  interval: string,
  thresholds: Thresholds,
  aiStrategyConfig: AiStrategyConfig,
  confirmationInputs: ConfirmationInput[] = []
): Promise<RegimeAnalysis> {
  const primaryAnalysis = analyzeSingleTimeframe(candles, symbol, interval, thresholds);
  const confirmationAnalyses = confirmationInputs.map((confirmation) =>
    analyzeSingleTimeframe(confirmation.candles, symbol, confirmation.interval, thresholds)
  );
  const aiStrategy = await runAiStrategy(candles, aiStrategyConfig, primaryAnalysis.regime);

  let finalRegime = primaryAnalysis.regime;
  let finalConfidence = primaryAnalysis.confidence;
  const reasons = [...primaryAnalysis.reasons];

  const alignedCount = confirmationAnalyses.filter(
    (confirmation) => confirmation.regime === primaryAnalysis.regime
  ).length;
  const opposingCount = confirmationAnalyses.filter(
    (confirmation) =>
      confirmation.regime !== primaryAnalysis.regime && confirmation.regime !== "sideways"
  ).length;
  const sidewaysCount = confirmationAnalyses.filter(
    (confirmation) => confirmation.regime === "sideways"
  ).length;

  if (confirmationAnalyses.length > 0) {
    if (primaryAnalysis.regime === "sideways") {
      if (alignedCount > 0) {
        finalConfidence = clamp(primaryAnalysis.confidence + alignedCount * 0.04, 0.5, 0.95);
        reasons.push(`Sideways structure is confirmed by ${alignedCount} higher timeframe(s).`);
      } else if (opposingCount > 0) {
        finalConfidence = clamp(primaryAnalysis.confidence - 0.1, 0.5, 0.9);
        reasons.push("Higher timeframes are trending, so the sideways reading is lower conviction.");
      }
    } else if (alignedCount === confirmationAnalyses.length) {
      finalConfidence = clamp(primaryAnalysis.confidence + confirmationAnalyses.length * 0.05, 0.5, 0.99);
      reasons.push("All confirmation timeframes agree with the primary regime.");
    } else if (alignedCount > opposingCount) {
      finalConfidence = clamp(primaryAnalysis.confidence + alignedCount * 0.03, 0.5, 0.99);
      reasons.push("Most confirmation timeframes support the primary regime.");
    } else if (opposingCount > alignedCount) {
      finalConfidence = clamp(primaryAnalysis.confidence - opposingCount * 0.08, 0.5, 0.95);
      reasons.push("Higher timeframes conflict with the primary trend, reducing conviction.");

      if (opposingCount >= Math.ceil(confirmationAnalyses.length / 2)) {
        finalRegime = "sideways";
        finalConfidence = clamp(finalConfidence, 0.5, 0.8);
        reasons.push("The trend is downgraded to sideways until higher timeframes align.");
      }
    } else if (sidewaysCount === confirmationAnalyses.length) {
      finalConfidence = clamp(primaryAnalysis.confidence - 0.08, 0.5, 0.95);
      reasons.push("Higher timeframes are neutral, so the trend signal remains tentative.");
    }
  }

  if (aiStrategy.enabled) {
    if (aiStrategy.regime === finalRegime && aiStrategy.confidence >= 0.55) {
      finalConfidence = clamp(finalConfidence + (aiStrategy.confidence - 0.5) * 0.25, 0.5, 0.99);
      reasons.push("The AI strategy agrees with the confirmed regime and increases conviction.");
    } else if (aiStrategy.regime !== finalRegime && aiStrategy.regime !== "sideways") {
      finalConfidence = clamp(finalConfidence - (aiStrategy.confidence - 0.5) * 0.3, 0.5, 0.95);
      reasons.push("The AI strategy disagrees with the confirmed regime, which reduces conviction.");

      if (aiStrategy.confidence >= 0.7) {
        finalRegime = "sideways";
        finalConfidence = clamp(finalConfidence, 0.5, 0.8);
        reasons.push("Strong AI disagreement downgrades the final call to sideways.");
      }
    } else {
      reasons.push("The AI strategy is neutral and does not materially alter the regime call.");
    }
  }

  const confirmations: TimeframeConfirmation[] = confirmationAnalyses.map((confirmation) => ({
    interval: confirmation.interval,
    regime: confirmation.regime,
    confidence: confirmation.confidence,
    aligned: confirmation.regime === finalRegime
  }));

  return {
    symbol: primaryAnalysis.symbol,
    interval: primaryAnalysis.interval,
    regime: finalRegime,
    primaryRegime: primaryAnalysis.regime,
    timestamp: new Date().toISOString(),
    confidence: round(finalConfidence),
    metrics: primaryAnalysis.metrics,
    confirmations,
    aiStrategy: {
      ...aiStrategy,
      agreedWithPrimary: aiStrategy.regime === primaryAnalysis.regime
    },
    reasons
  };
}