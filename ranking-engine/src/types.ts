export type MarketRegime = "bull" | "bear" | "sideways";

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface Thresholds {
  adxTrend: number;
  emaSlope: number;
  emaSpread: number;
  sidewaysAtr: number;
  volumeTrend: number;
  volumeSideways: number;
}

export interface RegimeMetrics {
  lastClose: number;
  ema20: number;
  ema50: number;
  ema20Slope: number;
  emaSpreadPercent: number;
  adx: number;
  plusDI: number;
  minusDI: number;
  atrPercent: number;
  rsi: number;
  volumeSma20: number;
  volumeRatio: number;
}

export interface TimeframePrediction {
  interval: string;
  regime: MarketRegime;
  confidence: number;
  metrics: RegimeMetrics;
  reasons: string[];
}

export interface PairRanking {
  symbol: string;
  dominantRegime: MarketRegime;
  consistencyScore: number;
  consistencyRatio: number;
  dominantConfidence: number;
  averageConfidence: number;
  counts: Record<MarketRegime, number>;
  predictions: TimeframePrediction[];
}

export interface RankingConfig {
  exchangeId: string;
  intervals: string[];
  runIntervalMs: number;
  lookbackLimit: number;
  concurrency: number;
  quoteCurrencies: string[];
  maxPairs?: number;
  outputFormat: "table" | "json";
  outputLimit?: number;
  thresholds: Thresholds;
}