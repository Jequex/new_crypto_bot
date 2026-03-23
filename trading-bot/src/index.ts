import { AppConfig, getApiPort, getDatabaseUrl, getRankingConfigSeed, getRuntimeConfigSeed, loadConfig } from "./config";
import { initializeTradingDatabase } from "./services/database";
import { startApiServer } from "./services/apiServer";
import { fetchCandles } from "./services/exchangeClient";
import { logEvent } from "./services/logger";
import { analyzeMarketRegime } from "./services/marketRegimeAnalyzer";
import { runTradingCycle } from "./services/tradingEngine";

function persistLog(databaseUrl: string, payload: Parameters<typeof logEvent>[1]): Promise<void> {
  return logEvent(databaseUrl, payload).catch(() => undefined);
}

function analyzeAndTradeSymbol(symbol: string, config: AppConfig): Promise<void> {
  const confirmationIntervals = config.confirmationIntervals.filter(
    (candidate) => candidate !== config.interval
  );

  return Promise.all([
    fetchCandles(config.exchangeId, symbol, config.interval, config.lookbackLimit),
    ...confirmationIntervals.map((confirmationInterval) =>
      fetchCandles(config.exchangeId, symbol, confirmationInterval, config.lookbackLimit).then(
        (candles) => ({
          interval: confirmationInterval,
          candles
        })
      )
    )
  ])
    .then(async ([candles, ...confirmationInputs]) => {
      const analysis = await analyzeMarketRegime(
        candles,
        symbol,
        config.interval,
        config.thresholds,
        config.aiStrategy,
        confirmationInputs
      );
      const lastPrice = candles.at(-1)?.close;

      if (lastPrice === undefined) {
        throw new Error("No latest price available from candle set.");
      }

      const trading = await runTradingCycle(analysis, lastPrice, config.trading);

      await persistLog(config.trading.databaseUrl, {
        level: "info",
        source: "analysis-cycle",
        symbol,
        message: `Completed analysis cycle for ${symbol}.`,
        details: {
          analysis,
          trading
        }
      });
    })
    .catch((error: Error) => {
      return persistLog(config.trading.databaseUrl, {
        level: "error",
        source: "analysis-cycle",
        symbol,
        message: `Analysis cycle failed for ${symbol}.`,
        details: {
          timestamp: new Date().toISOString(),
          exchangeId: config.exchangeId,
          interval: config.interval,
          confirmationIntervals,
          tradingMode: config.trading.mode,
          error: error.message
        }
      });
    });
}

async function runAnalysisCycle(databaseUrl: string): Promise<number> {
  const config = await loadConfig(databaseUrl);

  await Promise.all(config.symbols.map((symbol) => analyzeAndTradeSymbol(symbol, config)));
  return config.analysisIntervalMs;
}

function scheduleNextCycle(databaseUrl: string, delayMs: number): void {
  setTimeout(() => {
    void runAnalysisCycle(databaseUrl)
      .then((nextDelayMs) => {
        scheduleNextCycle(databaseUrl, nextDelayMs);
      })
      .catch((error: Error) => {
        void persistLog(databaseUrl, {
          level: "error",
          source: "scheduler",
          message: "Analysis scheduler failed.",
          details: {
            timestamp: new Date().toISOString(),
            error: error.message
          }
        }).finally(() => {
          scheduleNextCycle(databaseUrl, 5000);
        });
      });
  }, delayMs);
}

async function main(): Promise<void> {
  const databaseUrl = getDatabaseUrl();
  await initializeTradingDatabase(databaseUrl, getRuntimeConfigSeed(), getRankingConfigSeed());
  await startApiServer(databaseUrl, getApiPort());
  const nextDelayMs = await runAnalysisCycle(databaseUrl);
  scheduleNextCycle(databaseUrl, nextDelayMs);
}

void main();