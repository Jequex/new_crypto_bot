import { config } from "./config";
import { fetchCandles } from "./services/exchangeClient";
import { analyzeMarketRegime } from "./services/marketRegimeAnalyzer";

function printAnalysis(): Promise<void> {
  return fetchCandles(config.exchangeId, config.symbol, config.interval, config.lookbackLimit)
    .then((candles) =>
      analyzeMarketRegime(candles, config.symbol, config.interval, config.thresholds)
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