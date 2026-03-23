export type MarketRegime = "bull" | "bear" | "sideways";
export type TradingMode = "paper" | "live";
export type StrategyName = "dca" | "grid" | "none";
export type OrderSide = "buy" | "sell";

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

export interface AiStrategyResult {
  enabled: boolean;
  mode: "neural" | "centroid" | "fallback";
  regime: MarketRegime;
  confidence: number;
  agreedWithPrimary: boolean;
  trainingSamples: number;
  labelDistribution: {
    bull: number;
    bear: number;
    sideways: number;
  };
  probabilities: {
    bull: number;
    bear: number;
    sideways: number;
  };
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
    volumeSma20: number;
    volumeRatio: number;
  };
  confirmations: TimeframeConfirmation[];
  aiStrategy: AiStrategyResult;
  reasons: string[];
}

export interface TradeExecution {
  id: string;
  timestamp: string;
  mode: TradingMode;
  strategy: Exclude<StrategyName, "none">;
  side: OrderSide;
  price: number;
  entryPrice?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  baseAmount: number;
  quoteAmount: number;
  feeAmount: number;
  realizedPnlQuote?: number;
  realizedPnlPercent?: number;
  status: "filled" | "skipped";
  reason: string;
  note?: string;
}

export interface RankingMetrics {
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

export interface RankingPrediction {
  interval: string;
  regime: MarketRegime;
  confidence: number;
  metrics: RankingMetrics;
  reasons: string[];
}

export interface RankingSnapshotItem {
  symbol: string;
  dominantRegime: MarketRegime;
  consistencyScore: number;
  consistencyRatio: number;
  dominantConfidence: number;
  averageConfidence: number;
  counts: Record<MarketRegime, number>;
  predictions: RankingPrediction[];
}

export interface RankingSnapshot {
  runId: number;
  exchangeId: string;
  intervals: string[];
  createdAt: string;
  total: number;
  items: RankingSnapshotItem[];
}

export interface TradingBalances {
  base: number;
  quote: number;
  feesPaid: number;
}

export interface DcaState {
  entries: number;
  baseAmount: number;
  quoteSpent: number;
  avgEntryPrice: number;
  lastEntryPrice: number;
  trailingTakeProfitActive: boolean;
  highestPriceSinceEntry: number;
  trailingStopPrice: number;
}

export interface GridLevel {
  baseAmount: number;
  entryPrice: number;
  quoteSpent: number;
  feeAmount: number;
}

export interface GridState {
  entries: number;
  baseAmount: number;
  quoteSpent: number;
  avgEntryPrice: number;
  lastBuyPrice: number;
  lastSellPrice: number;
  trailingTakeProfitActive: boolean;
  highestPriceSinceEntry: number;
  trailingTakeProfitStopPrice: number;
  trailingStopLossPrice: number;
  levels: GridLevel[];
}

export interface TradingState {
  symbol: string;
  mode: TradingMode;
  activeStrategy: StrategyName;
  lastPrice: number;
  balances: TradingBalances;
  dca: DcaState;
  grid: GridState;
  tradeHistory: TradeExecution[];
  lastUpdated: string;
}

export interface TradingCycleResult {
  enabled: boolean;
  mode: TradingMode;
  preferredStrategy: StrategyName;
  activeStrategy: StrategyName;
  price: number;
  executions: TradeExecution[];
  balances: TradingBalances;
  dca: DcaState;
  grid: GridState;
  actionablePoints: string[];
}