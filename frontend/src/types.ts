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

export interface TradingStateSummary {
  symbol: string;
  mode: "paper" | "live";
  activeStrategy: "dca" | "grid" | "none";
  lastPrice: number;
  balances: TradingBalances;
  dca: DcaState;
  grid: GridState;
  lastUpdated: string;
}

export interface RuntimeConfig {
  exchangeId: string;
  symbol: string;
  symbols: string[];
  interval: string;
  confirmationIntervals: string[];
  analysisIntervalMs: number;
  initialQuoteBalance: number;
  dcaTrancheQuote: number;
}

export interface RankingEngineConfig {
  exchangeId: string;
  rankingIntervals: string[];
}

export type MarketRegime = "bull" | "bear" | "sideways";

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

export interface RankingSnapshotResponse {
  runId: number;
  exchangeId: string;
  intervals: string[];
  createdAt: string;
  total: number;
  items: RankingSnapshotItem[];
}

export type RuntimeConfigUpdate = Partial<RuntimeConfig>;
export type RankingEngineConfigUpdate = Partial<RankingEngineConfig>;

export interface LogItem {
  id: number;
  level: "info" | "warn" | "error";
  source: string;
  symbol?: string;
  message: string;
  details?: unknown;
  createdAt: string;
}

export interface LogsResponse {
  items: LogItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LogsQuery {
  page: number;
  pageSize: number;
  level?: "info" | "warn" | "error";
  source?: string;
  symbol?: string;
  date?: string;
}

export interface TradeItem {
  id: string;
  timestamp: string;
  mode: "paper" | "live";
  strategy: "dca" | "grid";
  side: "buy" | "sell";
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

export interface TradesResponse {
  items: TradeItem[];
  total: number;
  page: number;
  pageSize: number;
}