import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { fetchRuntimeConfig, fetchTradingStates } from "../api";
import { StateCard } from "../components/StateCard";
import { TradingStateSummary } from "../types";

const refreshIntervalMs = 15000;

export function DashboardPage() {
  const [states, setStates] = useState<TradingStateSummary[]>([]);
  const [initialQuoteBalance, setInitialQuoteBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = () => {
      Promise.all([fetchTradingStates(), fetchRuntimeConfig()])
        .then(([statesResponse, runtimeConfig]) => {
          if (!cancelled) {
            setStates(statesResponse);
            setInitialQuoteBalance(runtimeConfig.initialQuoteBalance);
            setError(null);
          }
        })
        .catch((requestError: Error) => {
          if (!cancelled) {
            setError(requestError.message);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoading(false);
          }
        });
    };

    loadDashboard();
    const intervalId = window.setInterval(loadDashboard, refreshIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const filteredStates = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return states;
    }

    return states.filter((state) => state.symbol.toLowerCase().includes(normalizedQuery));
  }, [deferredQuery, states]);

  const summary = useMemo(() => {
    const openPositions = states.filter((state) => state.dca.entries > 0 || state.dca.baseAmount > 0).length;
    const trailingArmed = states.filter((state) => state.dca.trailingTakeProfitActive).length;
    const totalQuote = states.reduce((sum, state) => sum + state.balances.quote, 0);

    return {
      totalPairs: states.length,
      openPositions,
      trailingArmed,
      totalQuote
    };
  }, [states]);

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <div className="hero-panel__layout">
          <div>
            <p className="eyebrow">Realtime desk</p>
            <h1>Trading states at a glance</h1>
            <p className="hero-panel__copy">
              Monitor active bot positions, balances, and latest price snapshots for every configured currency pair.
            </p>
          </div>

          <div className="overview-grid">
            <article className="overview-card">
              <p className="label">Tracked pairs</p>
              <strong>{summary.totalPairs}</strong>
              <span>Symbols currently loaded from runtime config</span>
            </article>
            <article className="overview-card">
              <p className="label">Open positions</p>
              <strong>{summary.openPositions}</strong>
              <span>Pairs with active DCA exposure</span>
            </article>
            <article className="overview-card">
              <p className="label">Trailing active</p>
              <strong>{summary.trailingArmed}</strong>
              <span>Pairs currently protected by trailing exits</span>
            </article>
            <article className="overview-card overview-card--accent">
              <p className="label">Total quote balance</p>
              <strong>{summary.totalQuote.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
              <span>Aggregate quote funds across all tracked states</span>
            </article>
          </div>
        </div>
      </section>

      <section className="toolbar-panel">
        <div>
          <p className="eyebrow">Workspace filter</p>
          <h2 className="toolbar-panel__title">Find a symbol quickly</h2>
        </div>
        <label className="search-field">
          <span className="search-field__label">Search pairs</span>
          <input
            aria-label="Search trading state cards"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="BTC/USDT, QNT/USDT..."
            type="search"
            value={query}
          />
        </label>
      </section>

      {isLoading ? <div className="status-panel">Loading trading states...</div> : null}
      {error ? <div className="status-panel status-panel--error">{error}</div> : null}

      {!isLoading && !error ? (
        <section className="cards-grid">
          {filteredStates.map((state) => (
            <StateCard
              initialQuoteBalance={initialQuoteBalance}
              key={`${state.symbol}-${state.mode}`}
              state={state}
            />
          ))}
          {filteredStates.length === 0 ? (
            <div className="status-panel">No trading states matched your search.</div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}