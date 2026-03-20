import { Link } from "react-router-dom";

import { formatNumber, formatTimestamp } from "../lib/format";
import { TradingStateSummary } from "../types";

interface StateCardProps {
  state: TradingStateSummary;
  initialQuoteBalance: number;
}

export function StateCard({ state, initialQuoteBalance }: StateCardProps) {
  const hasOpenPosition = state.dca.entries > 0 || state.dca.baseAmount > 0;
  const trailingArmed = state.dca.trailingTakeProfitActive;
  const quoteBalancePnl = state.balances.quote - initialQuoteBalance;
  const openPositionPrice = hasOpenPosition
    ? (state.lastPrice * state.balances.base) : 0;
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
              ? `Avg entry ${formatNumber(state.dca.avgEntryPrice, 8)}`
              : "No open DCA exposure right now"}
          </span>
        </div>
        <div className="state-card__spotlight-stat">
          <p className="label">Open entries</p>
          <strong>{state.dca.entries}</strong>
          <span className="state-card__subtle">{hasOpenPosition ? "Position active" : "Flat"}</span>
        </div>
        <div className="state-card__spotlight-stat">
          <p className="label">Mode</p>
          <strong>{state.mode}</strong>
          <span className="state-card__subtle">{state.activeStrategy === "dca" ? "Auto-managing" : "Watching only"}</span>
        </div>
      </div>

      <div className="state-card__mini-strip">
        <span className={`mini-chip ${hasOpenPosition ? "mini-chip--live" : "mini-chip--muted"}`}>
          {hasOpenPosition ? "Position open" : "No open position"}
        </span>
        <span className="mini-chip">High since entry {formatNumber(state.dca.highestPriceSinceEntry, 8)}</span>
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
          <strong>{formatNumber(state.dca.avgEntryPrice, 8)}</strong>
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
          <p className="label">PnL %</p>
          <strong className={pnlClassName}>{formatNumber(pnlPercent, 2)}%</strong>
        </div>
        <div>
          <p className="label">Trailing stop</p>
          <strong>{formatNumber(state.dca.trailingStopPrice, 8)}</strong>
        </div>
      </div>

      <div className="state-card__footer">
        <span>Updated {formatTimestamp(state.lastUpdated)}</span>
        <span className="state-card__cta">View trades</span>
      </div>
    </Link>
  );
}