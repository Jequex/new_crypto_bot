import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { fetchRankingConfig, fetchRuntimeConfig, saveRankingConfig, saveRuntimeConfig } from "../api";
import { RankingEngineConfig, RuntimeConfig } from "../types";

interface RuntimeConfigFormValues {
  exchangeId: string;
  symbol: string;
  symbols: string;
  interval: string;
  confirmationIntervals: string;
  analysisIntervalMs: string;
  initialQuoteBalance: string;
  dcaTrancheQuote: string;
  gridTrancheQuote: string;
}

interface RankingConfigFormValues {
  exchangeId: string;
  rankingIntervals: string;
  rankingConcurrency: string;
}

function configToFormValues(config: RuntimeConfig): RuntimeConfigFormValues {
  return {
    exchangeId: config.exchangeId,
    symbol: config.symbol,
    symbols: config.symbols.join(", "),
    interval: config.interval,
    confirmationIntervals: config.confirmationIntervals.join(", "),
    analysisIntervalMs: String(config.analysisIntervalMs),
    initialQuoteBalance: String(config.initialQuoteBalance),
    dcaTrancheQuote: String(config.dcaTrancheQuote),
    gridTrancheQuote: String(config.gridTrancheQuote)
  };
}

function rankingConfigToFormValues(config: RankingEngineConfig): RankingConfigFormValues {
  return {
    exchangeId: config.exchangeId,
    rankingIntervals: config.rankingIntervals.join(", "),
    rankingConcurrency: String(config.rankingConcurrency)
  };
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parsePositiveNumber(value: string, fieldLabel: string): number {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new Error(`${fieldLabel} must be a positive number.`);
  }

  return parsedValue;
}

export function SettingsPage() {
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [rankingConfig, setRankingConfig] = useState<RankingEngineConfig | null>(null);
  const [formValues, setFormValues] = useState<RuntimeConfigFormValues | null>(null);
  const [rankingFormValues, setRankingFormValues] = useState<RankingConfigFormValues | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingBot, setIsSavingBot] = useState(false);
  const [isSavingRanking, setIsSavingRanking] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [botError, setBotError] = useState<string | null>(null);
  const [rankingError, setRankingError] = useState<string | null>(null);
  const [botSuccessMessage, setBotSuccessMessage] = useState<string | null>(null);
  const [rankingSuccessMessage, setRankingSuccessMessage] = useState<string | null>(null);

  const loadSettings = () => {
    setIsLoading(true);

    Promise.all([fetchRuntimeConfig(), fetchRankingConfig()])
      .then(([nextConfig, nextRankingConfig]) => {
        setConfig(nextConfig);
        setRankingConfig(nextRankingConfig);
        setFormValues(configToFormValues(nextConfig));
        setRankingFormValues(rankingConfigToFormValues(nextRankingConfig));
        setLoadError(null);
      })
      .catch((requestError: Error) => {
        setLoadError(requestError.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const summary = useMemo(() => {
    if (!config || !rankingConfig) {
      return null;
    }

    return {
      trackedSymbols: config.symbols.length,
      confirmationCount: config.confirmationIntervals.length,
      analysisSeconds: Math.round(config.analysisIntervalMs / 1000),
      rankingExchange: rankingConfig.exchangeId,
      rankingIntervals: rankingConfig.rankingIntervals.length,
      rankingConcurrency: rankingConfig.rankingConcurrency
    };
  }, [config, rankingConfig]);

  const handleFieldChange = (field: keyof RuntimeConfigFormValues, value: string) => {
    setFormValues((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        [field]: value
      };
    });
  };

  const handleRankingFieldChange = (field: keyof RankingConfigFormValues, value: string) => {
    setRankingFormValues((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        [field]: value
      };
    });
  };

  const handleResetBot = () => {
    if (!config) {
      return;
    }

    setFormValues(configToFormValues(config));
    setBotError(null);
    setBotSuccessMessage(null);
  };

  const handleResetRanking = () => {
    if (!rankingConfig) {
      return;
    }

    setRankingFormValues(rankingConfigToFormValues(rankingConfig));
    setRankingError(null);
    setRankingSuccessMessage(null);
  };

  const handleSubmitBot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!formValues) {
      return;
    }

    try {
      setIsSavingBot(true);
      setBotError(null);
      setBotSuccessMessage(null);

      const updatedConfig = await saveRuntimeConfig({
        exchangeId: formValues.exchangeId.trim(),
        symbol: formValues.symbol.trim(),
        symbols: parseList(formValues.symbols),
        interval: formValues.interval.trim(),
        confirmationIntervals: parseList(formValues.confirmationIntervals),
        analysisIntervalMs: parsePositiveNumber(formValues.analysisIntervalMs, "Analysis interval"),
        initialQuoteBalance: parsePositiveNumber(formValues.initialQuoteBalance, "Initial quote balance"),
        dcaTrancheQuote: parsePositiveNumber(formValues.dcaTrancheQuote, "DCA tranche quote"),
        gridTrancheQuote: parsePositiveNumber(formValues.gridTrancheQuote, "Grid tranche quote")
      });

      setConfig(updatedConfig);
      setFormValues(configToFormValues(updatedConfig));
      setBotSuccessMessage("Trading bot runtime config updated successfully.");
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Failed to update trading bot runtime config.";
      setBotError(message);
    } finally {
      setIsSavingBot(false);
    }
  };

  const handleSubmitRanking = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!rankingFormValues) {
      return;
    }

    try {
      setIsSavingRanking(true);
      setRankingError(null);
      setRankingSuccessMessage(null);

      const updatedConfig = await saveRankingConfig({
        exchangeId: rankingFormValues.exchangeId.trim(),
        rankingIntervals: parseList(rankingFormValues.rankingIntervals),
        rankingConcurrency: parsePositiveNumber(rankingFormValues.rankingConcurrency, "Ranking concurrency")
      });

      setRankingConfig(updatedConfig);
      setRankingFormValues(rankingConfigToFormValues(updatedConfig));
      setRankingSuccessMessage("Ranking engine config updated successfully.");
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Failed to update ranking engine config.";
      setRankingError(message);
    } finally {
      setIsSavingRanking(false);
    }
  };

  return (
    <main className="page-shell page-shell--settings">
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
            <p className="eyebrow">Runtime control</p>
            <h1>Trading and ranking settings</h1>
            <p className="hero-panel__copy">
              Manage the trading bot runtime and ranking engine runtime independently, with each configuration persisted to its own database record.
            </p>
          </div>

          <div className="overview-grid overview-grid--detail">
            <article className="overview-card">
              <p className="label">Primary symbol</p>
              <strong>{config?.symbol ?? "--"}</strong>
              <span>Default symbol for the trading bot runtime</span>
            </article>
            <article className="overview-card">
              <p className="label">Tracked symbols</p>
              <strong>{summary?.trackedSymbols ?? 0}</strong>
              <span>Symbols loaded into the trading bot</span>
            </article>
            <article className="overview-card">
              <p className="label">Ranking exchange</p>
              <strong>{summary?.rankingExchange ?? "--"}</strong>
              <span>Exchange used by the ranking engine</span>
            </article>
            <article className="overview-card overview-card--accent">
              <p className="label">Ranking intervals</p>
              <strong>{summary?.rankingIntervals ?? 0}</strong>
              <span>Timeframes scored by the ranking engine</span>
            </article>
            <article className="overview-card">
              <p className="label">Ranking concurrency</p>
              <strong>{summary?.rankingConcurrency ?? 0}</strong>
              <span>Pairs processed in parallel per ranking run</span>
            </article>
          </div>
        </div>
      </section>

      {isLoading ? <div className="status-panel">Loading runtime config...</div> : null}
      {loadError ? <div className="status-panel status-panel--error">{loadError}</div> : null}

      {!isLoading && formValues && rankingFormValues ? (
        <>
          {botError ? <div className="status-panel status-panel--error">{botError}</div> : null}
          {botSuccessMessage ? <div className="status-panel status-panel--success">{botSuccessMessage}</div> : null}
          <form className="settings-form" onSubmit={handleSubmitBot}>
            <section className="settings-card settings-card--grid">
              <div className="settings-field">
                <label htmlFor="exchangeId">Exchange ID</label>
                <input
                  id="exchangeId"
                  onChange={(event) => handleFieldChange("exchangeId", event.target.value)}
                  type="text"
                  value={formValues.exchangeId}
                />
              </div>

              <div className="settings-field">
                <label htmlFor="interval">Primary interval</label>
                <input
                  id="interval"
                  onChange={(event) => handleFieldChange("interval", event.target.value)}
                  type="text"
                  value={formValues.interval}
                />
              </div>

              <div className="settings-field">
                <label htmlFor="symbol">Primary symbol</label>
                <input
                  id="symbol"
                  onChange={(event) => handleFieldChange("symbol", event.target.value)}
                  type="text"
                  value={formValues.symbol}
                />
              </div>

              <div className="settings-field">
                <label htmlFor="analysisIntervalMs">Analysis interval in milliseconds</label>
                <input
                  id="analysisIntervalMs"
                  min="1"
                  onChange={(event) => handleFieldChange("analysisIntervalMs", event.target.value)}
                  step="1"
                  type="number"
                  value={formValues.analysisIntervalMs}
                />
              </div>

              <div className="settings-field settings-field--full">
                <label htmlFor="symbols">Tracked symbols</label>
                <textarea
                  id="symbols"
                  onChange={(event) => handleFieldChange("symbols", event.target.value)}
                  rows={4}
                  value={formValues.symbols}
                />
                <p className="field-note">Comma-separated list. The primary symbol is automatically preserved by the backend.</p>
              </div>

              <div className="settings-field settings-field--full">
                <label htmlFor="confirmationIntervals">Confirmation intervals</label>
                <input
                  id="confirmationIntervals"
                  onChange={(event) => handleFieldChange("confirmationIntervals", event.target.value)}
                  type="text"
                  value={formValues.confirmationIntervals}
                />
                <p className="field-note">Comma-separated timeframes like 4h, 1d, 1w.</p>
              </div>

              <div className="settings-field">
                <label htmlFor="initialQuoteBalance">Initial quote balance</label>
                <input
                  id="initialQuoteBalance"
                  min="1"
                  onChange={(event) => handleFieldChange("initialQuoteBalance", event.target.value)}
                  step="0.01"
                  type="number"
                  value={formValues.initialQuoteBalance}
                />
              </div>

              <div className="settings-field">
                <label htmlFor="dcaTrancheQuote">DCA tranche quote</label>
                <input
                  id="dcaTrancheQuote"
                  min="1"
                  onChange={(event) => handleFieldChange("dcaTrancheQuote", event.target.value)}
                  step="0.01"
                  type="number"
                  value={formValues.dcaTrancheQuote}
                />
              </div>

              <div className="settings-field">
                <label htmlFor="gridTrancheQuote">Grid tranche quote</label>
                <input
                  id="gridTrancheQuote"
                  min="1"
                  onChange={(event) => handleFieldChange("gridTrancheQuote", event.target.value)}
                  step="0.01"
                  type="number"
                  value={formValues.gridTrancheQuote}
                />
              </div>
            </section>

            <section className="settings-card settings-card--actions">
              <div>
                <p className="label">Trading bot</p>
                <h2 className="settings-card__title">Save bot runtime config</h2>
                <p className="hero-panel__copy">
                  These settings drive symbol tracking, confirmation timeframes, balances, and trade cycle cadence for the trading bot.
                </p>
              </div>

              <div className="settings-actions">
                <button className="secondary-button" disabled={isSavingBot} onClick={handleResetBot} type="button">
                  Reset form
                </button>
                <button className="secondary-button" disabled={isSavingBot || isLoading} onClick={loadSettings} type="button">
                  Reload from DB
                </button>
                <button className="primary-button" disabled={isSavingBot} type="submit">
                  {isSavingBot ? "Saving..." : "Save bot config"}
                </button>
              </div>
            </section>
          </form>

          {rankingError ? <div className="status-panel status-panel--error">{rankingError}</div> : null}
          {rankingSuccessMessage ? <div className="status-panel status-panel--success">{rankingSuccessMessage}</div> : null}
          <form className="settings-form" onSubmit={handleSubmitRanking}>
            <section className="settings-card settings-card--grid">
              <div className="settings-field">
                <label htmlFor="rankingExchangeId">Ranking exchange ID</label>
                <input
                  id="rankingExchangeId"
                  onChange={(event) => handleRankingFieldChange("exchangeId", event.target.value)}
                  type="text"
                  value={rankingFormValues.exchangeId}
                />
              </div>

              <div className="settings-field settings-field--full">
                <label htmlFor="rankingIntervals">Ranking intervals</label>
                <input
                  id="rankingIntervals"
                  onChange={(event) => handleRankingFieldChange("rankingIntervals", event.target.value)}
                  type="text"
                  value={rankingFormValues.rankingIntervals}
                />
                <p className="field-note">Comma-separated timeframes used only by the ranking engine, for example 15m, 1h, 4h, 1d.</p>
              </div>

              <div className="settings-field">
                <label htmlFor="rankingConcurrency">Ranking concurrency</label>
                <input
                  id="rankingConcurrency"
                  min="1"
                  onChange={(event) => handleRankingFieldChange("rankingConcurrency", event.target.value)}
                  step="1"
                  type="number"
                  value={rankingFormValues.rankingConcurrency}
                />
                <p className="field-note">How many pairs the ranking engine should process in parallel.</p>
              </div>
            </section>

            <section className="settings-card settings-card--actions">
              <div>
                <p className="label">Ranking engine</p>
                <h2 className="settings-card__title">Save ranking engine config</h2>
                <p className="hero-panel__copy">
                  These settings are stored independently from the trading bot and control the exchange and timeframe set used for ranking snapshots.
                </p>
              </div>

              <div className="settings-actions">
                <button className="secondary-button" disabled={isSavingRanking} onClick={handleResetRanking} type="button">
                  Reset form
                </button>
                <button className="secondary-button" disabled={isSavingRanking || isLoading} onClick={loadSettings} type="button">
                  Reload from DB
                </button>
                <button className="primary-button" disabled={isSavingRanking} type="submit">
                  {isSavingRanking ? "Saving..." : "Save ranking config"}
                </button>
              </div>
            </section>
          </form>
        </>
      ) : null}
    </main>
  );
}