import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, extname, join, resolve } from "path";

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

function symbolFileName(symbol: string): string {
  return symbol.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function resolveSymbolStatePath(symbol: string, stateFilePath: string): string {
  const absoluteBasePath = resolvePath(stateFilePath);
  const extension = extname(absoluteBasePath);

  if (!extension) {
    return join(absoluteBasePath, `${symbolFileName(symbol)}.json`);
  }

  const baseDirectory = dirname(absoluteBasePath);
  const fileName = absoluteBasePath.slice(baseDirectory.length + 1, -extension.length);
  return join(baseDirectory, `${fileName}.${symbolFileName(symbol)}${extension}`);
}

export async function loadTradingState(
  symbol: string,
  config: TradingStoreConfig
): Promise<TradingState> {
  const filePath = resolveSymbolStatePath(symbol, config.stateFilePath);

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
  const filePath = resolveSymbolStatePath(state.symbol, config.stateFilePath);
  await mkdir(dirname(filePath), { recursive: true });

  const trimmedState: TradingState = {
    ...state,
    tradeHistory: state.tradeHistory.slice(-config.maxTradeHistory),
    lastUpdated: new Date().toISOString()
  };

  await writeFile(filePath, `${JSON.stringify(trimmedState, null, 2)}\n`, "utf8");
}