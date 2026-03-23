import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { fetchRankings } from "../api";
import { formatNumber, formatPercent, formatTimestamp } from "../lib/format";
import { MarketRegime, RankingSnapshotResponse } from "../types";

const refreshIntervalMs = 30000;

type RegimeFilter = "all" | MarketRegime;

function formatRatio(value: number): string {
  return formatPercent(value * 100);
}

function formatIntervals(snapshot: RankingSnapshotResponse | null): string {
  if (!snapshot || snapshot.intervals.length === 0) {
    return "No timeframe data yet";
  }

  return snapshot.intervals.join(", ");
}

export function RankingsPage() {
  const [snapshot, setSnapshot] = useState<RankingSnapshotResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [regimeFilter, setRegimeFilter] = useState<RegimeFilter>("all");
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    const loadRankings = () => {
      fetchRankings()
        .then((nextSnapshot) => {
          if (!cancelled) {
            setSnapshot(nextSnapshot);
            setError(null);
          }
        })
        .catch((requestError: Error) => {
          if (!cancelled) {
            setError(requestError.message);
            setSnapshot(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoading(false);
          }
        });
    };

    loadRankings();
    const intervalId = window.setInterval(loadRankings, refreshIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const filteredItems = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    const items = snapshot?.items ?? [];

    return items.filter((item) => {
      if (regimeFilter !== "all" && item.dominantRegime !== regimeFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return item.symbol.toLowerCase().includes(normalizedQuery);
    });
  }, [deferredQuery, regimeFilter, snapshot]);

  const summary = useMemo(() => {
    const items = snapshot?.items ?? [];

    return {
      total: items.length,
      bulls: items.filter((item) => item.dominantRegime === "bull").length,
      bears: items.filter((item) => item.dominantRegime === "bear").length,
      topSymbol: items[0]?.symbol ?? "--"
    };
  }, [snapshot]);

  return (
    <main className="page-shell page-shell--detail">
      <section className="hero-panel hero-panel--compact">
        <div className="hero-panel__layout hero-panel__layout--detail">
          <div>
            <div className="page-actions">
              <Link className="nav-pill" to="/">
                Dashboard
              </Link>
              <Link className="nav-pill" to="/rankings">
                Rankings
              </Link>
              <Link className="nav-pill" to="/logs">
                Logs
              </Link>
              <Link className="nav-pill" to="/settings">
                Settings
              </Link>
            </div>
            <p className="eyebrow">Cross-pair ranking</p>
            <h1>Latest ranking snapshot</h1>
            <p className="hero-panel__copy">
              Review the most recent multi-timeframe ranking run persisted by the ranking engine and compare symbols by directional agreement.
            </p>
          </div>

          <div className="overview-grid overview-grid--detail">
            <article className="overview-card">
              <p className="label">Ranked pairs</p>
              <strong>{summary.total}</strong>
              <span>Symbols stored in the latest snapshot</span>
            </article>
            <article className="overview-card">
              <p className="label">Bullish leaders</p>
              <strong>{summary.bulls}</strong>
              <span>Pairs with bullish dominant regime</span>
            </article>
            <article className="overview-card">
              <p className="label">Bearish leaders</p>
              <strong>{summary.bears}</strong>
              <span>Pairs with bearish dominant regime</span>
            </article>
            <article className="overview-card overview-card--accent">
              <p className="label">Top symbol</p>
              <strong>{summary.topSymbol}</strong>
              <span>{formatIntervals(snapshot)}</span>
            </article>
          </div>
        </div>
      </section>

      <section className="toolbar-panel toolbar-panel--filters">
        <div>
          <p className="eyebrow">Snapshot filters</p>
          <h2 className="toolbar-panel__title">Inspect the latest run</h2>
        </div>
        <div className="filters-grid">
          <label className="search-field">
            <span className="search-field__label">Search symbol</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="BTC/USDT, ETH/USDT..."
              type="search"
              value={query}
            />
          </label>

          <label className="search-field">
            <span className="search-field__label">Dominant regime</span>
            <select onChange={(event) => setRegimeFilter(event.target.value as RegimeFilter)} value={regimeFilter}>
              <option value="all">All regimes</option>
              <option value="bull">Bullish</option>
              <option value="bear">Bearish</option>
              <option value="sideways">Sideways</option>
            </select>
          </label>
        </div>
      </section>

      {isLoading ? <div className="status-panel">Loading ranking snapshot...</div> : null}
      {error ? <div className="status-panel status-panel--error">{error}</div> : null}

      {!isLoading && !error && !snapshot ? (
        <div className="status-panel">No ranking snapshot has been saved yet. Run the ranking engine to populate this page.</div>
      ) : null}

      {!isLoading && !error && snapshot ? (
        <section className="trades-panel">
          <div className="rankings-panel__meta">
            <span>Run #{snapshot.runId}</span>
            <span>{snapshot.exchangeId}</span>
            <span>{snapshot.intervals.join(", ")}</span>
            <span>{formatTimestamp(snapshot.createdAt)}</span>
          </div>

          <div className="table-shell">
            <table className="trades-table rankings-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Symbol</th>
                  <th>Regime</th>
                  <th>Score</th>
                  <th>Agreement</th>
                  <th>Dom. confidence</th>
                  <th>Avg. confidence</th>
                  <th>Counts</th>
                  <th>Predictions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, index) => (
                  <tr key={item.symbol}>
                    <td>{index + 1}</td>
                    <td>{item.symbol}</td>
                    <td>
                      <span className={`badge badge--${item.dominantRegime}`}>{item.dominantRegime}</span>
                    </td>
                    <td>{formatNumber(item.consistencyScore, 2)}</td>
                    <td>{formatRatio(item.consistencyRatio)}</td>
                    <td>{formatRatio(item.dominantConfidence)}</td>
                    <td>{formatRatio(item.averageConfidence)}</td>
                    <td>
                      <div className="counts-breakdown">
                        <span>Bull: {item.counts.bull}</span>
                        <span>Bear: {item.counts.bear}</span>
                        <span>Sideways: {item.counts.sideways}</span>
                      </div>
                    </td>
                    <td>
                      <details className="ranking-predictions">
                        <summary>{item.predictions.length} timeframe predictions</summary>
                        <div className="ranking-predictions__list">
                          {item.predictions.map((prediction) => (
                            <div className="prediction-chip" key={`${item.symbol}-${prediction.interval}`}>
                              <div className="prediction-chip__header">
                                <span className="mini-chip">{prediction.interval}</span>
                                <span className={`badge badge--${prediction.regime}`}>{prediction.regime}</span>
                              </div>
                              <strong>Confidence: {formatRatio(prediction.confidence)}</strong>
                              <span>Close: {formatNumber(prediction.metrics.lastClose, 8)}</span>
                              <p>{prediction.reasons.join(" ")}</p>
                            </div>
                          ))}
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredItems.length === 0 ? <div className="status-panel">No ranking rows matched the current filters.</div> : null}
        </section>
      ) : null}
    </main>
  );
}