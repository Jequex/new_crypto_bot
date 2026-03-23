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

export type RuntimeConfigUpdate = Partial<RuntimeConfig>;

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