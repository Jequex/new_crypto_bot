import { AppConfig, getApiPort, getDatabaseUrl, getRuntimeConfigSeed, loadConfig } from "./config";
import { initializeTradingDatabase } from "./services/database";
import { startApiServer } from "./services/apiServer";
import { fetchCandles } from "./services/exchangeClient";
import { analyzeMarketRegime } from "./services/marketRegimeAnalyzer";
import { runTradingCycle } from "./services/tradingEngine";

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

      console.log(
        JSON.stringify(
          {
            symbol,
            analysis,
            trading
          },
          null,
          2
        )
      );
    })
    .catch((error: Error) => {
      console.error(
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            exchangeId: config.exchangeId,
            symbol,
            interval: config.interval,
            confirmationIntervals,
            tradingMode: config.trading.mode,
            error: error.message
          },
          null,
          2
        )
      );
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
        console.error(
          JSON.stringify(
            {
              timestamp: new Date().toISOString(),
              error: error.message,
              source: "analysis-cycle"
            },
            null,
            2
          )
        );
        scheduleNextCycle(databaseUrl, 5000);
      });
  }, delayMs);
}

async function main(): Promise<void> {
  const databaseUrl = getDatabaseUrl();
  await initializeTradingDatabase(databaseUrl, getRuntimeConfigSeed());
  await startApiServer(databaseUrl, getApiPort());
  const nextDelayMs = await runAnalysisCycle(databaseUrl);
  scheduleNextCycle(databaseUrl, nextDelayMs);
}

void main();