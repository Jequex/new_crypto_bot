import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { fetchTrades } from "../api";
import { formatNumber, formatPercent, formatTimestamp } from "../lib/format";
import { TradesResponse } from "../types";

const pageSize = 10;
const refreshIntervalMs = 15000;

export function TradesPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = useMemo(() => decodeURIComponent(params.symbol ?? ""), [params.symbol]);
  const [page, setPage] = useState(1);
  const [response, setResponse] = useState<TradesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [symbol]);

  useEffect(() => {
    if (!symbol) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const loadTrades = () => {
      fetchTrades(symbol, page, pageSize)
        .then((nextResponse) => {
          if (!cancelled) {
            setResponse(nextResponse);
            setError(null);
          }
        })
        .catch((requestError: Error) => {
          if (!cancelled) {
            setError(requestError.message);
            setResponse(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoading(false);
          }
        });
    };

    loadTrades();
    const intervalId = window.setInterval(loadTrades, refreshIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [page, symbol]);

  const totalPages = response ? Math.max(1, Math.ceil(response.total / response.pageSize)) : 1;
  const totalBuys = response?.items.filter((trade) => trade.side === "buy").length ?? 0;
  const totalSells = response?.items.filter((trade) => trade.side === "sell").length ?? 0;

  return (
    <main className="page-shell page-shell--detail">
      <section className="hero-panel hero-panel--compact">
        <div className="hero-panel__layout hero-panel__layout--detail">
          <div>
            <div className="page-actions">
              <Link className="nav-pill" to="/">
                Dashboard
              </Link>
              <Link className="nav-pill" to="/logs">
                Logs
              </Link>
              <Link className="nav-pill" to="/settings">
                Settings
              </Link>
            </div>
            <Link className="back-link" to="/">
              Back to states
            </Link>
            <p className="eyebrow">Trade ledger</p>
            <h1>{symbol}</h1>
            <p className="hero-panel__copy">Paginated trade history for the selected currency pair.</p>
          </div>

          <div className="overview-grid overview-grid--detail">
            <article className="overview-card">
              <p className="label">Page</p>
              <strong>{page}</strong>
              <span>of {totalPages}</span>
            </article>
            <article className="overview-card">
              <p className="label">Buys on page</p>
              <strong>{totalBuys}</strong>
              <span>Latest accumulation events</span>
            </article>
            <article className="overview-card">
              <p className="label">Sells on page</p>
              <strong>{totalSells}</strong>
              <span>Latest exits and reductions</span>
            </article>
            <article className="overview-card overview-card--accent">
              <p className="label">Total trades</p>
              <strong>{response?.total ?? 0}</strong>
              <span>Stored executions for this pair</span>
            </article>
          </div>
        </div>
      </section>

      {isLoading ? <div className="status-panel">Loading trades...</div> : null}
      {error ? <div className="status-panel status-panel--error">{error}</div> : null}

      {!isLoading && !error && response ? (
        <section className="trades-panel">
          <div className="trades-panel__meta">
            <span>
              Showing page {response.page} of {totalPages}
            </span>
            <span>{response.total} total trades</span>
          </div>

          <div className="table-shell">
            <table className="trades-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Side</th>
                  <th>Price</th>
                  <th>Base</th>
                  <th>Quote</th>
                  <th>PnL</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {response.items.map((trade) => (
                  <tr key={trade.id}>
                    <td>{formatTimestamp(trade.timestamp)}</td>
                    <td>
                      <span className={`badge badge--${trade.side}`}>{trade.side}</span>
                    </td>
                    <td>{formatNumber(trade.price, 8)}</td>
                    <td>{formatNumber(trade.baseAmount, 6)}</td>
                    <td>{formatNumber(trade.quoteAmount, 4)}</td>
                    <td>
                      <div className={trade.realizedPnlQuote !== undefined && trade.realizedPnlQuote < 0 ? "pnl pnl--negative" : "pnl pnl--positive"}>
                        {formatNumber(trade.realizedPnlQuote ?? 0, 4)}
                      </div>
                      <small>{formatPercent(trade.realizedPnlPercent)}</small>
                    </td>
                    <td>{trade.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination-bar">
            <button disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button">
              Previous
            </button>
            <span>
              Page {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              type="button"
            >
              Next
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}