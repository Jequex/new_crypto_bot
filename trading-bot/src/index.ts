import { config } from "./config";
import { initializeTradingDatabase } from "./services/database";
import { fetchCandles } from "./services/exchangeClient";
import { analyzeMarketRegime } from "./services/marketRegimeAnalyzer";
import { runTradingCycle } from "./services/tradingEngine";

function analyzeAndTradeSymbol(symbol: string): Promise<void> {
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

function printAnalysis(): Promise<void> {
  return Promise.all(config.symbols.map((symbol) => analyzeAndTradeSymbol(symbol))).then(() => undefined);
}

async function main(): Promise<void> {
  await initializeTradingDatabase(config.trading.databaseUrl);
  await printAnalysis();

  setInterval(() => {
    void printAnalysis();
  }, config.analysisIntervalMs);
}

void main();