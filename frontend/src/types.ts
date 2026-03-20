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

export interface TradingStateSummary {
  symbol: string;
  mode: "paper" | "live";
  activeStrategy: "dca" | "none";
  lastPrice: number;
  balances: TradingBalances;
  dca: DcaState;
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

export interface TradeItem {
  id: string;
  timestamp: string;
  mode: "paper" | "live";
  strategy: "dca";
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