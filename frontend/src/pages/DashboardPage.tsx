import { useEffect, useState } from "react";

import { fetchTradingStates } from "../api";
import { StateCard } from "../components/StateCard";
import { TradingStateSummary } from "../types";

export function DashboardPage() {
  const [states, setStates] = useState<TradingStateSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchTradingStates()
      .then((response) => {
        if (!cancelled) {
          setStates(response);
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

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <p className="eyebrow">Realtime desk</p>
        <h1>Trading states at a glance</h1>
        <p className="hero-panel__copy">
          Monitor active bot positions, balances, and latest price snapshots for every configured currency pair.
        </p>
      </section>

      {isLoading ? <div className="status-panel">Loading trading states...</div> : null}
      {error ? <div className="status-panel status-panel--error">{error}</div> : null}

      {!isLoading && !error ? (
        <section className="cards-grid">
          {states.map((state) => (
            <StateCard key={`${state.symbol}-${state.mode}`} state={state} />
          ))}
        </section>
      ) : null}
    </main>
  );
}