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

export interface TimeframeConfirmation {
  interval: string;
  regime: MarketRegime;
  confidence: number;
  aligned: boolean;
}

export interface RegimeAnalysis {
  symbol: string;
  interval: string;
  regime: MarketRegime;
  primaryRegime: MarketRegime;
  timestamp: string;
  confidence: number;
  metrics: {
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
  };
  confirmations: TimeframeConfirmation[];
  reasons: string[];
}