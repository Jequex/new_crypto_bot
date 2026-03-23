import { Link } from "react-router-dom";

import { formatNumber, formatTimestamp } from "../lib/format";
import { TradingStateSummary } from "../types";

interface StateCardProps {
  state: TradingStateSummary;
  initialQuoteBalance: number;
}

export function StateCard({ state, initialQuoteBalance }: StateCardProps) {
  const hasOpenDcaPosition = state.dca.entries > 0 || state.dca.baseAmount > 0;
  const hasOpenGridPosition = state.grid.entries > 0 || state.grid.baseAmount > 0;
  const hasOpenPosition = hasOpenDcaPosition || hasOpenGridPosition;
  const isGridActive = state.activeStrategy === "grid" || (!hasOpenDcaPosition && hasOpenGridPosition);
  const trailingArmed = isGridActive ? state.grid.trailingTakeProfitActive : state.dca.trailingTakeProfitActive;
  const positionEntries = isGridActive ? state.grid.entries : state.dca.entries;
  const positionQuoteSpent = isGridActive ? state.grid.quoteSpent : state.dca.quoteSpent;
  const averageEntryPrice = isGridActive ? state.grid.avgEntryPrice : state.dca.avgEntryPrice;
  const referenceCaption = isGridActive
    ? `High since entry ${formatNumber(state.grid.highestPriceSinceEntry, 8)}`
    : `High since entry ${formatNumber(state.dca.highestPriceSinceEntry, 8)}`;
  const trailingStopValue = isGridActive
    ? Math.max(state.grid.trailingTakeProfitStopPrice, state.grid.trailingStopLossPrice)
    : state.dca.trailingStopPrice;
  const quoteBalancePnl = state.balances.quote - initialQuoteBalance;
  const openPositionCost = hasOpenPosition ? positionQuoteSpent : 0;
  const openPositionPrice = hasOpenPosition ? state.lastPrice * state.balances.base : 0;
  const pnlQuote = quoteBalancePnl + openPositionPrice - state.balances.feesPaid;
  const pnlPercent = initialQuoteBalance > 0 ? (pnlQuote / initialQuoteBalance) * 100 : 0;
  const pnlClassName = pnlQuote < 0 ? "pnl pnl--negative" : "pnl pnl--positive";

  return (
    <Link className="state-card" to={`/pairs/${encodeURIComponent(state.symbol)}`}>
      <div className="state-card__header">
        <div>
          <p className="eyebrow">Currency pair</p>
          <h2>{state.symbol}</h2>
        </div>
        <div className="state-card__header-badges">
          <span className={`badge badge--${state.activeStrategy}`}>{state.activeStrategy}</span>
          {trailingArmed ? <span className="badge badge--accent">trailing</span> : null}
        </div>
      </div>

      <div className="state-card__spotlight">
        <div>
          <p className="label">Live snapshot</p>
          <strong className="state-card__headline-value">{formatNumber(state.lastPrice, 8)}</strong>
          <span className="state-card__subtle">
            {hasOpenPosition
              ? `Avg entry ${formatNumber(averageEntryPrice, 8)}`
              : "No open strategy exposure right now"}
          </span>
        </div>
        <div className="state-card__spotlight-stat">
          <p className="label">Open entries</p>
          <strong>{positionEntries}</strong>
          <span className="state-card__subtle">{hasOpenPosition ? "Position active" : "Flat"}</span>
        </div>
        <div className="state-card__spotlight-stat">
          <p className="label">Mode</p>
          <strong>{state.mode}</strong>
          <span className="state-card__subtle">{state.activeStrategy === "none" ? "Watching only" : "Auto-managing"}</span>
        </div>
      </div>

      <div className="state-card__mini-strip">
        <span className={`mini-chip ${hasOpenPosition ? "mini-chip--live" : "mini-chip--muted"}`}>
          {hasOpenPosition ? "Position open" : "No open position"}
        </span>
        <span className="mini-chip">{referenceCaption}</span>
      </div>

      <div className="state-card__grid">
        <div>
          <p className="label">Quote balance</p>
          <strong>{formatNumber(state.balances.quote, 2)}</strong>
        </div>
        <div>
          <p className="label">Base balance</p>
          <strong>{formatNumber(state.balances.base, 6)}</strong>
        </div>
        <div>
          <p className="label">Average entry</p>
          <strong>{formatNumber(averageEntryPrice, 8)}</strong>
        </div>
        <div>
          <p className="label">PnL</p>
          <strong className={pnlClassName}>{formatNumber(pnlQuote, 2)}</strong>
        </div>
        <div>
          <p className="label">Fees paid</p>
          <strong>{formatNumber(state.balances.feesPaid, 4)}</strong>
        </div>
        <div>
          <p className="label">Open position cost</p>
          <strong>{formatNumber(openPositionCost, 2)}</strong>
        </div>
        <div>
          <p className="label">PnL %</p>
          <strong className={pnlClassName}>{formatNumber(pnlPercent, 2)}%</strong>
        </div>
        <div>
          <p className="label">Trailing stop</p>
          <strong>{trailingStopValue > 0 ? formatNumber(trailingStopValue, 8) : "-"}</strong>
        </div>
      </div>

      <div className="state-card__footer">
        <span>Updated {formatTimestamp(state.lastUpdated)}</span>
        <span className="state-card__cta">View trades</span>
      </div>
    </Link>
  );
}