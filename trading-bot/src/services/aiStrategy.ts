import * as tf from "@tensorflow/tfjs-node";
import { ADX, ATR, EMA, RSI, SMA } from "technicalindicators";

import { AiStrategyResult, Candle, MarketRegime } from "../types";

interface AiStrategyConfig {
  enabled: boolean;
  epochs: number;
  lookaheadCandles: number;
  returnThreshold: number;
}

interface IndicatorSnapshot {
  ema20: Array<number | undefined>;
  ema50: Array<number | undefined>;
  adx: Array<number | undefined>;
  pdi: Array<number | undefined>;
  mdi: Array<number | undefined>;
  atr: Array<number | undefined>;
  rsi: Array<number | undefined>;
  volumeSma20: Array<number | undefined>;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function createEmptyResult(enabled: boolean): AiStrategyResult {
  return {
    enabled,
    mode: "fallback",
    regime: "sideways",
    confidence: 0.5,
    agreedWithPrimary: false,
    trainingSamples: 0,
    labelDistribution: {
      bull: 0,
      bear: 0,
      sideways: 0
    },
    probabilities: {
      bull: 0.3333,
      bear: 0.3333,
      sideways: 0.3333
    }
  };
}

function mapSeries(series: number[], period: number, totalLength: number): Array<number | undefined> {
  const mapped = new Array<number | undefined>(totalLength).fill(undefined);
  const startIndex = period - 1;

  series.forEach((value, index) => {
    mapped[startIndex + index] = value;
  });

  return mapped;
}

function mapAdxSeries(
  series: Array<{ adx: number; pdi: number; mdi: number }>,
  totalLength: number
): Pick<IndicatorSnapshot, "adx" | "pdi" | "mdi"> {
  const adx = new Array<number | undefined>(totalLength).fill(undefined);
  const pdi = new Array<number | undefined>(totalLength).fill(undefined);
  const mdi = new Array<number | undefined>(totalLength).fill(undefined);
  const startIndex = 27;

  series.forEach((value, index) => {
    adx[startIndex + index] = value.adx;
    pdi[startIndex + index] = value.pdi;
    mdi[startIndex + index] = value.mdi;
  });

  return { adx, pdi, mdi };
}

function buildIndicators(candles: Candle[]): IndicatorSnapshot {
  const closes = candles.map((candle) => candle.close);
  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  const volumes = candles.map((candle) => candle.volume);

  const ema20 = mapSeries(EMA.calculate({ period: 20, values: closes }), 20, candles.length);
  const ema50 = mapSeries(EMA.calculate({ period: 50, values: closes }), 50, candles.length);
  const atr = mapSeries(
    ATR.calculate({ period: 14, close: closes, high: highs, low: lows }),
    14,
    candles.length
  );
  const rsi = mapSeries(RSI.calculate({ period: 14, values: closes }), 14, candles.length);
  const volumeSma20 = mapSeries(SMA.calculate({ period: 20, values: volumes }), 20, candles.length);
  const adxMapped = mapAdxSeries(
    ADX.calculate({ period: 14, close: closes, high: highs, low: lows }),
    candles.length
  );

  return {
    ema20,
    ema50,
    atr,
    rsi,
    volumeSma20,
    adx: adxMapped.adx,
    pdi: adxMapped.pdi,
    mdi: adxMapped.mdi
  };
}

function normalizeFeature(value: number, scale: number): number {
  return Math.max(-3, Math.min(3, value / scale));
}

function featureVector(candles: Candle[], indicators: IndicatorSnapshot, index: number): number[] | undefined {
  const currentCandle = candles[index];
  const previousCandle = candles[index - 1];
  const ema20 = indicators.ema20[index];
  const ema20Prev = indicators.ema20[index - 5];
  const ema50 = indicators.ema50[index];
  const adx = indicators.adx[index];
  const pdi = indicators.pdi[index];
  const mdi = indicators.mdi[index];
  const atr = indicators.atr[index];
  const rsi = indicators.rsi[index];
  const volumeSma20 = indicators.volumeSma20[index];
  const closeThreeBack = candles[index - 3]?.close;

  if (
    !currentCandle ||
    !previousCandle ||
    ema20 === undefined ||
    ema20Prev === undefined ||
    ema50 === undefined ||
    adx === undefined ||
    pdi === undefined ||
    mdi === undefined ||
    atr === undefined ||
    rsi === undefined ||
    volumeSma20 === undefined ||
    closeThreeBack === undefined
  ) {
    return undefined;
  }

  const emaSpread = (ema20 - ema50) / ema50;
  const emaSlope = (ema20 - ema20Prev) / ema20Prev;
  const atrPercent = atr / currentCandle.close;
  const volumeRatio = volumeSma20 > 0 ? currentCandle.volume / volumeSma20 : 1;
  const oneBarReturn = (currentCandle.close - previousCandle.close) / previousCandle.close;
  const threeBarReturn = (currentCandle.close - closeThreeBack) / closeThreeBack;

  return [
    normalizeFeature(emaSpread, 0.01),
    normalizeFeature(emaSlope, 0.01),
    normalizeFeature(adx - 20, 20),
    normalizeFeature((pdi - mdi) / 100, 0.3),
    normalizeFeature(atrPercent, 0.02),
    normalizeFeature((rsi - 50) / 50, 0.5),
    normalizeFeature(volumeRatio - 1, 0.5),
    normalizeFeature(oneBarReturn, 0.02),
    normalizeFeature(threeBarReturn, 0.04)
  ];
}

function findLatestUsableFeatureVector(
  candles: Candle[],
  indicators: IndicatorSnapshot
): number[] | undefined {
  for (let index = candles.length - 1; index >= 0; index -= 1) {
    const row = featureVector(candles, indicators, index);

    if (row) {
      return row;
    }
  }

  return undefined;
}

function oneHotLabel(labelIndex: number): number[] {
  return [0, 1, 2].map((value) => (value === labelIndex ? 1 : 0));
}

function labelFromFutureReturn(futureReturn: number, returnThreshold: number): number {
  if (futureReturn > returnThreshold) {
    return 0;
  }

  if (futureReturn < -returnThreshold) {
    return 1;
  }

  return 2;
}

function regimeFromIndex(index: number): MarketRegime {
  if (index === 0) {
    return "bull";
  }

  if (index === 1) {
    return "bear";
  }

  return "sideways";
}

function distributionFromCounts(counts: number[]): AiStrategyResult["labelDistribution"] {
  return {
    bull: counts[0] ?? 0,
    bear: counts[1] ?? 0,
    sideways: counts[2] ?? 0
  };
}

function calculateNormalizationStats(features: number[][]): { means: number[]; stdDevs: number[] } {
  const featureCount = features[0]?.length ?? 0;
  const means = new Array<number>(featureCount).fill(0);
  const stdDevs = new Array<number>(featureCount).fill(1);

  for (let column = 0; column < featureCount; column += 1) {
    const values = features.map((row) => row[column]);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    means[column] = mean;
    stdDevs[column] = Math.sqrt(variance) || 1;
  }

  return { means, stdDevs };
}

function normalizeRows(features: number[][], means: number[], stdDevs: number[]): number[][] {
  return features.map((row) =>
    row.map((value, index) => {
      const normalized = (value - means[index]) / stdDevs[index];
      return Math.max(-5, Math.min(5, normalized));
    })
  );
}

function normalizeRow(feature: number[], means: number[], stdDevs: number[]): number[] {
  return feature.map((value, index) => {
    const normalized = (value - means[index]) / stdDevs[index];
    return Math.max(-5, Math.min(5, normalized));
  });
}

function argMax(values: number[]): number {
  let bestIndex = 0;
  let bestValue = values[0] ?? Number.NEGATIVE_INFINITY;

  for (let index = 1; index < values.length; index += 1) {
    if (values[index] > bestValue) {
      bestValue = values[index];
      bestIndex = index;
    }
  }

  return bestIndex;
}

function softmax(values: number[]): number[] {
  const maxValue = Math.max(...values);
  const exponentials = values.map((value) => Math.exp(value - maxValue));
  const sum = exponentials.reduce((total, value) => total + value, 0);

  return exponentials.map((value) => value / sum);
}

function centroidProbabilities(features: number[][], labelIndexes: number[], latestFeature: number[]): number[] {
  const classCount = 3;
  const featureCount = latestFeature.length;
  const centroids = new Array(classCount).fill(undefined).map(() => new Array<number>(featureCount).fill(0));
  const counts = new Array<number>(classCount).fill(0);

  features.forEach((row, rowIndex) => {
    const labelIndex = labelIndexes[rowIndex];
    counts[labelIndex] += 1;

    row.forEach((value, featureIndex) => {
      centroids[labelIndex][featureIndex] += value;
    });
  });

  centroids.forEach((centroid, classIndex) => {
    if (counts[classIndex] === 0) {
      return;
    }

    for (let featureIndex = 0; featureIndex < centroid.length; featureIndex += 1) {
      centroid[featureIndex] /= counts[classIndex];
    }
  });

  const scores = centroids.map((centroid, classIndex) => {
    if (counts[classIndex] === 0) {
      return -12;
    }

    const distance = Math.sqrt(
      centroid.reduce((sum, value, featureIndex) => sum + (latestFeature[featureIndex] - value) ** 2, 0)
    );

    return -distance;
  });

  return softmax(scores);
}

function isUniformPrediction(probabilities: number[]): boolean {
  const spread = Math.max(...probabilities) - Math.min(...probabilities);
  return spread < 0.03;
}

function buildResult(
  mode: AiStrategyResult["mode"],
  probabilities: number[],
  primaryRegime: MarketRegime,
  trainingSamples: number,
  labelCounts: number[]
): AiStrategyResult {
  const bull = probabilities[0] ?? 0.3333;
  const bear = probabilities[1] ?? 0.3333;
  const sideways = probabilities[2] ?? 0.3333;
  const regimeIndex = argMax([bull, bear, sideways]);
  const regime = regimeFromIndex(regimeIndex);
  const confidence = Math.max(0.5, Math.min(0.99, [bull, bear, sideways][regimeIndex] ?? 0.5));

  return {
    enabled: true,
    mode,
    regime,
    confidence: round(confidence),
    agreedWithPrimary: regime === primaryRegime,
    trainingSamples,
    labelDistribution: distributionFromCounts(labelCounts),
    probabilities: {
      bull: round(bull),
      bear: round(bear),
      sideways: round(sideways)
    }
  };
}

export async function runAiStrategy(
  candles: Candle[],
  config: AiStrategyConfig,
  primaryRegime: MarketRegime
): Promise<AiStrategyResult> {
  const emptyResult = createEmptyResult(config.enabled);

  if (!config.enabled || candles.length < 90) {
    return emptyResult;
  }

  const indicators = buildIndicators(candles);
  const features: number[][] = [];
  const labels: number[][] = [];
  const labelIndexes: number[] = [];

  const startIndex = 60;
  const lastTrainIndex = candles.length - config.lookaheadCandles - 1;

  for (let index = startIndex; index <= lastTrainIndex; index += 1) {
    const row = featureVector(candles, indicators, index);
    const futureClose = candles[index + config.lookaheadCandles]?.close;
    const currentClose = candles[index]?.close;

    if (!row || futureClose === undefined || currentClose === undefined) {
      continue;
    }

    const futureReturn = (futureClose - currentClose) / currentClose;
    const labelIndex = labelFromFutureReturn(futureReturn, config.returnThreshold);

    features.push(row);
    labels.push(oneHotLabel(labelIndex));
    labelIndexes.push(labelIndex);
  }

  const latestFeatures = findLatestUsableFeatureVector(candles, indicators);
  const labelCounts = [0, 0, 0];
  labelIndexes.forEach((labelIndex) => {
    labelCounts[labelIndex] += 1;
  });

  if (features.length < 30 || !latestFeatures) {
    return {
      ...emptyResult,
      labelDistribution: distributionFromCounts(labelCounts),
      trainingSamples: features.length
    };
  }

  const { means, stdDevs } = calculateNormalizationStats(features);
  const normalizedFeatures = normalizeRows(features, means, stdDevs);
  const normalizedLatestFeatures = normalizeRow(latestFeatures, means, stdDevs);
  const centroidOnlyProbabilities = centroidProbabilities(
    normalizedFeatures,
    labelIndexes,
    normalizedLatestFeatures
  );
  const activeClassCount = labelCounts.filter((count) => count > 0).length;

  if (activeClassCount < 2) {
    return buildResult(
      "centroid",
      centroidOnlyProbabilities,
      primaryRegime,
      features.length,
      labelCounts
    );
  }

  const featureTensor = tf.tensor2d(normalizedFeatures);
  const labelTensor = tf.tensor2d(labels);
  const predictionTensor = tf.tensor2d([normalizedLatestFeatures]);

  const model = tf.sequential({
    layers: [
      tf.layers.dense({ inputShape: [latestFeatures.length], units: 16, activation: "relu" }),
      tf.layers.dense({ units: 8, activation: "relu" }),
      tf.layers.dense({ units: 3, activation: "softmax" })
    ]
  });

  model.compile({
    optimizer: tf.train.adam(0.01),
    loss: "categoricalCrossentropy",
    metrics: ["accuracy"]
  });

  try {
    await model.fit(featureTensor, labelTensor, {
      epochs: config.epochs,
      batchSize: Math.min(32, features.length),
      shuffle: true,
      verbose: 0
    });

    const prediction = model.predict(predictionTensor) as tf.Tensor;
    const neuralProbabilities = Array.from(await prediction.data()).map((value) => Number(value));

    prediction.dispose();

    const validNeuralProbabilities =
      neuralProbabilities.length === 3 &&
      neuralProbabilities.every((value) => Number.isFinite(value) && value >= 0) &&
      !isUniformPrediction(neuralProbabilities);

    if (!validNeuralProbabilities) {
      return buildResult(
        "centroid",
        centroidOnlyProbabilities,
        primaryRegime,
        features.length,
        labelCounts
      );
    }

    const blendedProbabilities = neuralProbabilities.map(
      (value, index) => value * 0.65 + centroidOnlyProbabilities[index] * 0.35
    );

    return buildResult("neural", blendedProbabilities, primaryRegime, features.length, labelCounts);
  } finally {
    model.dispose();
    featureTensor.dispose();
    labelTensor.dispose();
    predictionTensor.dispose();
  }
}