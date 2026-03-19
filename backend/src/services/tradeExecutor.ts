import { placeMarketOrder } from "./exchangeClient";

import { OrderSide, TradeExecution, TradingState } from "../types";

interface TradingConfig {
  mode: "paper" | "live";
  feeRate: number;
  exchangeId?: string;
  symbol?: string;
}

interface TradeRequest {
  strategy: "dca" | "grid";
  side: OrderSide;
  price: number;
  baseAmount: number;
  reason: string;
}

function round(value: number): number {
  return Number(value.toFixed(8));
}

function executionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function executeTrade(
  state: TradingState,
  request: TradeRequest,
  config: TradingConfig
): Promise<TradeExecution> {
  const quoteAmount = round(request.baseAmount * request.price);
  const feeAmount = round(quoteAmount * config.feeRate);

  if (request.baseAmount <= 0 || request.price <= 0) {
    return {
      id: executionId(),
      timestamp: new Date().toISOString(),
      mode: config.mode,
      strategy: request.strategy,
      side: request.side,
      price: round(request.price),
      baseAmount: round(request.baseAmount),
      quoteAmount,
      feeAmount,
      status: "skipped",
      reason: request.reason,
      note: "Trade request had a non-positive amount or price."
    };
  }

  if (request.side === "buy") {
    const totalCost = quoteAmount + feeAmount;

    if (state.balances.quote < totalCost) {
      return {
        id: executionId(),
        timestamp: new Date().toISOString(),
        mode: config.mode,
        strategy: request.strategy,
        side: request.side,
        price: round(request.price),
        baseAmount: round(request.baseAmount),
        quoteAmount,
        feeAmount,
        status: "skipped",
        reason: request.reason,
        note: "Insufficient quote balance."
      };
    }
  }

  if (request.side === "sell" && state.balances.base < request.baseAmount) {
    return {
      id: executionId(),
      timestamp: new Date().toISOString(),
      mode: config.mode,
      strategy: request.strategy,
      side: request.side,
      price: round(request.price),
      baseAmount: round(request.baseAmount),
      quoteAmount,
      feeAmount,
      status: "skipped",
      reason: request.reason,
      note: "Insufficient base balance."
    };
  }

  if (config.mode === "live") {
    if (!config.exchangeId || !config.symbol) {
      throw new Error("Live trading requires exchangeId and symbol.");
    }

    await placeMarketOrder(config.exchangeId, config.symbol, request.side, request.baseAmount);
  }

  if (request.side === "buy") {
    state.balances.base = round(state.balances.base + request.baseAmount);
    state.balances.quote = round(state.balances.quote - quoteAmount - feeAmount);
  } else {
    state.balances.base = round(state.balances.base - request.baseAmount);
    state.balances.quote = round(state.balances.quote + quoteAmount - feeAmount);
  }

  state.balances.feesPaid = round(state.balances.feesPaid + feeAmount);

  const execution: TradeExecution = {
    id: executionId(),
    timestamp: new Date().toISOString(),
    mode: config.mode,
    strategy: request.strategy,
    side: request.side,
    price: round(request.price),
    baseAmount: round(request.baseAmount),
    quoteAmount,
    feeAmount,
    status: "filled",
    reason: request.reason
  };

  state.tradeHistory.push(execution);
  return execution;
}