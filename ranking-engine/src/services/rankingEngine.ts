import { ADX, ATR, EMA, RSI, SMA } from "technicalindicators";

import { loadSymbols, fetchCandles } from "./exchangeClient";
import { Candle, MarketRegime, PairRanking, RankingConfig, Thresholds, TimeframePrediction } from "../types";

function round(value: number): number {
  return Number(value.toFixed(4));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function analyzeTimeframe(candles: Candle[], interval: string, thresholds: Thresholds): TimeframePrediction {
  if (candles.length < 60) {
    throw new Error("At least 60 candles are required to classify the market regime.");
  }

  const closes = candles.map((candle) => candle.close);
  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  const volumes = candles.map((candle) => candle.volume);

  const ema20Series = EMA.calculate({ period: 20, values: closes });
  const ema50Series = EMA.calculate({ period: 50, values: closes });
  const adxSeries = ADX.calculate({ period: 14, close: closes, high: highs, low: lows });
  const atrSeries = ATR.calculate({ period: 14, close: closes, high: highs, low: lows });
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
    reasons.push("EMAs are tightly clustered with limited slope.");
    reasons.push("Volatility is compressed relative to price.");
  } else if (bullScore > bearScore && bullScore >= 3) {
    regime = "bull";
    confidence = clamp(0.5 + bullScore * 0.08 + adx.adx / 100, 0.5, 0.99);
    reasons.push("Directional evidence favors a bullish structure.");
    if (volumeTrendConfirmed) {
      reasons.push("Volume confirms bullish participation.");
    }
  } else if (bearScore > bullScore && bearScore >= 3) {
    regime = "bear";
    confidence = clamp(0.5 + bearScore * 0.08 + adx.adx / 100, 0.5, 0.99);
    reasons.push("Directional evidence favors a bearish structure.");
    if (volumeTrendConfirmed) {
      reasons.push("Volume confirms bearish participation.");
    }
  } else {
    regime = "sideways";
    confidence = clamp(0.5 + (1 - Math.abs(emaSpreadPercent)) * 0.1, 0.5, 0.8);
    reasons.push("Signals are mixed, so this timeframe is treated as sideways.");
  }

  return {
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

function createEmptyCounts(): Record<MarketRegime, number> {
  return {
    bull: 0,
    bear: 0,
    sideways: 0
  };
}

function pickDominantRegime(predictions: TimeframePrediction[]): MarketRegime {
  const counts = createEmptyCounts();
  const confidenceSums = createEmptyCounts();

  predictions.forEach((prediction) => {
    counts[prediction.regime] += 1;
    confidenceSums[prediction.regime] += prediction.confidence;
  });

  return (["bull", "bear", "sideways"] as MarketRegime[]).sort((left, right) => {
    if (counts[right] !== counts[left]) {
      return counts[right] - counts[left];
    }

    return confidenceSums[right] - confidenceSums[left];
  })[0];
}

function buildRanking(symbol: string, predictions: TimeframePrediction[]): PairRanking {
  const counts = createEmptyCounts();
  const confidenceSums = createEmptyCounts();

  predictions.forEach((prediction) => {
    counts[prediction.regime] += 1;
    confidenceSums[prediction.regime] += prediction.confidence;
  });

  const dominantRegime = pickDominantRegime(predictions);
  const sortedCounts = Object.values(counts).sort((left, right) => right - left);
  const dominantCount = counts[dominantRegime];
  const runnerUpCount = sortedCounts[1] ?? 0;
  const consistencyRatio = dominantCount / predictions.length;
  const dominantConfidence = confidenceSums[dominantRegime] / dominantCount;
  const averageConfidence = predictions.reduce((sum, prediction) => sum + prediction.confidence, 0) / predictions.length;
  const agreementMargin = (dominantCount - runnerUpCount) / predictions.length;
  const consistencyScore = round(consistencyRatio * 70 + dominantConfidence * 25 + agreementMargin * 5);

  return {
    symbol,
    dominantRegime,
    consistencyScore,
    consistencyRatio: round(consistencyRatio),
    dominantConfidence: round(dominantConfidence),
    averageConfidence: round(averageConfidence),
    counts,
    predictions
  };
}

async function analyzePair(symbol: string, config: RankingConfig): Promise<PairRanking> {
  const predictions: TimeframePrediction[] = [];

  for (const interval of config.intervals) {
    const candles = await fetchCandles(config.exchangeId, symbol, interval, config.lookbackLimit);
    predictions.push(analyzeTimeframe(candles, interval, config.thresholds));
  }

  return buildRanking(symbol, predictions);
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>
): Promise<TOutput[]> {
  const results = new Array<TOutput>(items.length);
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < items.length) {
      const index = currentIndex;
      currentIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export async function rankPairs(config: RankingConfig): Promise<PairRanking[]> {
  const symbols = await loadSymbols(config.exchangeId, config.quoteCurrencies);
  const selectedSymbols = config.maxPairs ? symbols.slice(0, config.maxPairs) : symbols;
  const results = await mapWithConcurrency(selectedSymbols, config.concurrency, async (symbol) => {
    try {
      return {
        symbol,
        ranking: await analyzePair(symbol, config)
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return {
        symbol,
        error: message
      };
    }
  });

  const failures = results.filter((result): result is { symbol: string; error: string } => "error" in result);
  failures.forEach((failure) => {
    console.warn(`Skipping ${failure.symbol}: ${failure.error}`);
  });

  const rankings = results
    .filter((result): result is { symbol: string; ranking: PairRanking } => "ranking" in result)
    .map((result) => result.ranking);

  if (rankings.length === 0) {
    throw new Error("Unable to rank any pairs successfully.");
  }

  return rankings.sort((left, right) => {
    if (right.consistencyScore !== left.consistencyScore) {
      return right.consistencyScore - left.consistencyScore;
    }

    return left.symbol.localeCompare(right.symbol);
  });
}