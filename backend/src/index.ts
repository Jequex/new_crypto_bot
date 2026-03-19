import { config } from "./config";
import { fetchCandles } from "./services/exchangeClient";
import { analyzeMarketRegime } from "./services/marketRegimeAnalyzer";

function printAnalysis(): Promise<void> {
  const confirmationIntervals = config.confirmationIntervals.filter(
    (candidate) => candidate !== config.interval
  );

  return Promise.all([
    fetchCandles(config.exchangeId, config.symbol, config.interval, config.lookbackLimit),
    ...confirmationIntervals.map((confirmationInterval) =>
      fetchCandles(config.exchangeId, config.symbol, confirmationInterval, config.lookbackLimit).then(
        (candles) => ({
          interval: confirmationInterval,
          candles
        })
      )
    )
  ])
    .then(([candles, ...confirmationInputs]) =>
      analyzeMarketRegime(
        candles,
        config.symbol,
        config.interval,
        config.thresholds,
        confirmationInputs
      )
    )
    .then((analysis) => {
      console.log(JSON.stringify(analysis, null, 2));
    })
    .catch((error: Error) => {
      console.error(
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            exchangeId: config.exchangeId,
            symbol: config.symbol,
            interval: config.interval,
            confirmationIntervals,
            error: error.message
          },
          null,
          2
        )
      );
    });
}

async function main(): Promise<void> {
  await printAnalysis();

  setInterval(() => {
    void printAnalysis();
  }, config.analysisIntervalMs);
}

void main();