import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { fetchRuntimeConfig, saveRuntimeConfig } from "../api";
import { RuntimeConfig } from "../types";

interface RuntimeConfigFormValues {
  exchangeId: string;
  symbol: string;
  symbols: string;
  interval: string;
  confirmationIntervals: string;
  analysisIntervalMs: string;
  initialQuoteBalance: string;
  dcaTrancheQuote: string;
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
    dcaTrancheQuote: String(config.dcaTrancheQuote)
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
  const [formValues, setFormValues] = useState<RuntimeConfigFormValues | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadConfig = () => {
    setIsLoading(true);

    fetchRuntimeConfig()
      .then((nextConfig) => {
        setConfig(nextConfig);
        setFormValues(configToFormValues(nextConfig));
        setError(null);
      })
      .catch((requestError: Error) => {
        setError(requestError.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const summary = useMemo(() => {
    if (!config) {
      return null;
    }

    return {
      trackedSymbols: config.symbols.length,
      confirmationCount: config.confirmationIntervals.length,
      analysisSeconds: Math.round(config.analysisIntervalMs / 1000)
    };
  }, [config]);

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

  const handleReset = () => {
    if (!config) {
      return;
    }

    setFormValues(configToFormValues(config));
    setError(null);
    setSuccessMessage(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!formValues) {
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setSuccessMessage(null);

      const updatedConfig = await saveRuntimeConfig({
        exchangeId: formValues.exchangeId.trim(),
        symbol: formValues.symbol.trim(),
        symbols: parseList(formValues.symbols),
        interval: formValues.interval.trim(),
        confirmationIntervals: parseList(formValues.confirmationIntervals),
        analysisIntervalMs: parsePositiveNumber(formValues.analysisIntervalMs, "Analysis interval"),
        initialQuoteBalance: parsePositiveNumber(formValues.initialQuoteBalance, "Initial quote balance"),
        dcaTrancheQuote: parsePositiveNumber(formValues.dcaTrancheQuote, "DCA tranche quote")
      });

      setConfig(updatedConfig);
      setFormValues(configToFormValues(updatedConfig));
      setSuccessMessage("Runtime config updated successfully.");
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Failed to update runtime config.";
      setError(message);
    } finally {
      setIsSaving(false);
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
              <Link className="nav-pill" to="/settings">
                Settings
              </Link>
            </div>
            <p className="eyebrow">Runtime control</p>
            <h1>Trading bot settings</h1>
            <p className="hero-panel__copy">
              Update the runtime configuration persisted in the bot database without restarting the frontend.
            </p>
          </div>

          <div className="overview-grid overview-grid--detail">
            <article className="overview-card">
              <p className="label">Primary symbol</p>
              <strong>{config?.symbol ?? "--"}</strong>
              <span>Used as the default seed for runtime state</span>
            </article>
            <article className="overview-card">
              <p className="label">Tracked symbols</p>
              <strong>{summary?.trackedSymbols ?? 0}</strong>
              <span>Symbols loaded into the bot runtime config</span>
            </article>
            <article className="overview-card">
              <p className="label">Confirmations</p>
              <strong>{summary?.confirmationCount ?? 0}</strong>
              <span>Higher timeframe intervals used for alignment</span>
            </article>
            <article className="overview-card overview-card--accent">
              <p className="label">Analysis cadence</p>
              <strong>{summary?.analysisSeconds ?? 0}s</strong>
              <span>Current delay between analysis cycles</span>
            </article>
          </div>
        </div>
      </section>

      {isLoading ? <div className="status-panel">Loading runtime config...</div> : null}
      {error ? <div className="status-panel status-panel--error">{error}</div> : null}
      {successMessage ? <div className="status-panel status-panel--success">{successMessage}</div> : null}

      {!isLoading && formValues ? (
        <form className="settings-form" onSubmit={handleSubmit}>
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
          </section>

          <section className="settings-card settings-card--actions">
            <div>
              <p className="label">Persistence</p>
              <h2 className="settings-card__title">Save directly to bot runtime config</h2>
              <p className="hero-panel__copy">
                Changes are written to the database through the API and become the new runtime baseline for the bot.
              </p>
            </div>

            <div className="settings-actions">
              <button className="secondary-button" disabled={isSaving} onClick={handleReset} type="button">
                Reset form
              </button>
              <button className="secondary-button" disabled={isSaving} onClick={loadConfig} type="button">
                Reload from bot
              </button>
              <button className="primary-button" disabled={isSaving} type="submit">
                {isSaving ? "Saving..." : "Save runtime config"}
              </button>
            </div>
          </section>
        </form>
      ) : null}
    </main>
  );
}