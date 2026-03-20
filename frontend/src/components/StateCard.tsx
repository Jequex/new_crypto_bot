import { Link } from "react-router-dom";

import { formatNumber, formatTimestamp } from "../lib/format";
import { TradingStateSummary } from "../types";

interface StateCardProps {
  state: TradingStateSummary;
}

export function StateCard({ state }: StateCardProps) {
  return (
    <Link className="state-card" to={`/pairs/${encodeURIComponent(state.symbol)}`}>
      <div className="state-card__header">
        <div>
          <p className="eyebrow">Currency pair</p>
          <h2>{state.symbol}</h2>
        </div>
        <span className={`badge badge--${state.activeStrategy}`}>{state.activeStrategy}</span>
      </div>

      <div className="state-card__price-row">
        <div>
          <p className="label">Last price</p>
          <strong>{formatNumber(state.lastPrice, 8)}</strong>
        </div>
        <div>
          <p className="label">Entries</p>
          <strong>{state.dca.entries}</strong>
        </div>
        <div>
          <p className="label">Mode</p>
          <strong>{state.mode}</strong>
        </div>
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
          <p className="label">Avg entry</p>
          <strong>{formatNumber(state.dca.avgEntryPrice, 8)}</strong>
        </div>
        <div>
          <p className="label">Fees paid</p>
          <strong>{formatNumber(state.balances.feesPaid, 4)}</strong>
        </div>
      </div>

      <div className="state-card__footer">
        <span>Updated {formatTimestamp(state.lastUpdated)}</span>
        <span className="state-card__cta">View trades</span>
      </div>
    </Link>
  );
}