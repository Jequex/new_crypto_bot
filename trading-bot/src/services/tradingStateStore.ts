import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, resolve } from "path";

import { TradingState } from "../types";

interface TradingStoreConfig {
  mode: "paper" | "live";
  stateFilePath: string;
  initialQuoteBalance: number;
  initialBaseBalance: number;
  maxTradeHistory: number;
}

function initialState(symbol: string, config: TradingStoreConfig): TradingState {
  return {
    symbol,
    mode: config.mode,
    activeStrategy: "none",
    balances: {
      base: config.initialBaseBalance,
      quote: config.initialQuoteBalance,
      feesPaid: 0
    },
    dca: {
      entries: 0,
      baseAmount: 0,
      quoteSpent: 0,
      avgEntryPrice: 0,
      lastEntryPrice: 0,
      trailingTakeProfitActive: false,
      highestPriceSinceEntry: 0,
      trailingStopPrice: 0
    },
    tradeHistory: [],
    lastUpdated: new Date().toISOString()
  };
}

function resolvePath(stateFilePath: string): string {
  return resolve(process.cwd(), stateFilePath);
}

export async function loadTradingState(
  symbol: string,
  config: TradingStoreConfig
): Promise<TradingState> {
  const filePath = resolvePath(config.stateFilePath);

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as TradingState;

    if (parsed.symbol !== symbol || parsed.mode !== config.mode) {
      return initialState(symbol, config);
    }

    return {
      ...parsed,
      dca: {
        ...initialState(symbol, config).dca,
        ...parsed.dca
      },
      tradeHistory: parsed.tradeHistory ?? []
    };
  } catch {
    return initialState(symbol, config);
  }
}

export async function saveTradingState(state: TradingState, config: TradingStoreConfig): Promise<void> {
  const filePath = resolvePath(config.stateFilePath);
  await mkdir(dirname(filePath), { recursive: true });

  const trimmedState: TradingState = {
    ...state,
    tradeHistory: state.tradeHistory.slice(-config.maxTradeHistory),
    lastUpdated: new Date().toISOString()
  };

  await writeFile(filePath, `${JSON.stringify(trimmedState, null, 2)}\n`, "utf8");
}