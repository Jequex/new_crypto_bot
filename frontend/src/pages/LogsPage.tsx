import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { fetchLogs } from "../api";
import { formatTimestamp } from "../lib/format";
import { LogItem, LogsResponse } from "../types";

const pageSize = 25;
const refreshIntervalMs = 15000;

function stringifyDetails(value: unknown): string {
  if (value === undefined || value === null) {
    return "-";
  }

  return JSON.stringify(value, null, 2);
}

function detailSummary(item: LogItem): string {
  if (item.details === undefined || item.details === null) {
    return "No details";
  }

  if (Array.isArray(item.details)) {
    return `Array details (${item.details.length} items)`;
  }

  if (typeof item.details === "object") {
    return `JSON details (${Object.keys(item.details as Record<string, unknown>).length} fields)`;
  }

  return "View details";
}

export function LogsPage() {
  const [page, setPage] = useState(1);
  const [response, setResponse] = useState<LogsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [symbolFilter, setSymbolFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  useEffect(() => {
    setPage(1);
  }, [symbolFilter, dateFilter]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    const loadLogs = () => {
      fetchLogs({
        page,
        pageSize,
        symbol: symbolFilter.trim() || undefined,
        date: dateFilter || undefined
      })
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

    loadLogs();
    const intervalId = window.setInterval(loadLogs, refreshIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [dateFilter, page, symbolFilter]);

  const totalPages = response ? Math.max(1, Math.ceil(response.total / response.pageSize)) : 1;
  const summary = useMemo(() => {
    const items = response?.items ?? [];

    return {
      total: response?.total ?? 0,
      errors: items.filter((item) => item.level === "error").length,
      infos: items.filter((item) => item.level === "info").length,
      warnings: items.filter((item) => item.level === "warn").length
    };
  }, [response]);

  return (
    <main className="page-shell page-shell--detail">
      <section className="hero-panel hero-panel--compact">
        <div className="hero-panel__layout hero-panel__layout--detail">
          <div>
            <div className="page-actions">
              <Link className="nav-pill" to="/">
                Dashboard
              </Link>
              <Link className="nav-pill" to="/settings">
                Settings
              </Link>
              <Link className="nav-pill" to="/logs">
                Logs
              </Link>
            </div>
            <p className="eyebrow">Runtime logs</p>
            <h1>Bot logs</h1>
            <p className="hero-panel__copy">Live application logs stored in PostgreSQL instead of container stdout.</p>
          </div>

          <div className="overview-grid overview-grid--detail">
            <article className="overview-card">
              <p className="label">Page</p>
              <strong>{page}</strong>
              <span>of {totalPages}</span>
            </article>
            <article className="overview-card">
              <p className="label">Errors on page</p>
              <strong>{summary.errors}</strong>
              <span>Recent failures captured by the bot</span>
            </article>
            <article className="overview-card">
              <p className="label">Infos on page</p>
              <strong>{summary.infos}</strong>
              <span>Cycle completions and service events</span>
            </article>
            <article className="overview-card overview-card--accent">
              <p className="label">Stored logs</p>
              <strong>{summary.total}</strong>
              <span>Total log rows available via the API</span>
            </article>
          </div>
        </div>
      </section>

      <section className="toolbar-panel toolbar-panel--filters">
        <div>
          <p className="eyebrow">Log filters</p>
          <h2 className="toolbar-panel__title">Narrow runtime events</h2>
        </div>
        <div className="filters-grid">
          <label className="search-field">
            <span className="search-field__label">Symbol</span>
            <input
              onChange={(event) => setSymbolFilter(event.target.value)}
              placeholder="QNT/USDT"
              type="search"
              value={symbolFilter}
            />
          </label>
          <label className="search-field">
            <span className="search-field__label">Date</span>
            <input onChange={(event) => setDateFilter(event.target.value)} type="date" value={dateFilter} />
          </label>
        </div>
      </section>

      {isLoading ? <div className="status-panel">Loading logs...</div> : null}
      {error ? <div className="status-panel status-panel--error">{error}</div> : null}

      {!isLoading && !error && response ? (
        <section className="trades-panel">
          <div className="trades-panel__meta">
            <span>
              Showing page {response.page} of {totalPages}
            </span>
            <span>{response.total} total logs</span>
          </div>

          <div className="table-shell">
            <table className="trades-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Level</th>
                  <th>Source</th>
                  <th>Symbol</th>
                  <th>Message</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {response.items.map((item) => (
                  <tr key={item.id}>
                    <td>{formatTimestamp(item.createdAt)}</td>
                    <td>
                      <span className={`badge badge--${item.level}`}>{item.level}</span>
                    </td>
                    <td>{item.source}</td>
                    <td>{item.symbol ?? "-"}</td>
                    <td>{item.message}</td>
                    <td>
                      <details className="log-details-disclosure">
                        <summary>{detailSummary(item)}</summary>
                        <pre className="log-details">{stringifyDetails(item.details)}</pre>
                      </details>
                    </td>
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