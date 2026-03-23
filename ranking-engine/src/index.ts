import { loadConfig } from "./config";
import { rankPairs } from "./services/rankingEngine";
import { PairRanking } from "./types";

function formatCounts(ranking: PairRanking): string {
  return `B:${ranking.counts.bull} R:${ranking.counts.bear} S:${ranking.counts.sideways}`;
}

function formatPredictionSummary(ranking: PairRanking): string {
  return ranking.predictions
    .map((prediction) => `${prediction.interval}:${prediction.regime}:${prediction.confidence.toFixed(2)}`)
    .join(" | ");
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value.padEnd(width, " ");
}

function printTable(rankings: PairRanking[], outputLimit?: number): void {
  const rows = outputLimit ? rankings.slice(0, outputLimit) : rankings;
  const headers = [
    pad("Rank", 6),
    pad("Symbol", 18),
    pad("Regime", 10),
    pad("Score", 8),
    pad("Ratio", 8),
    pad("DomConf", 10),
    pad("Counts", 14),
    "Predictions"
  ];

  console.log(headers.join(" "));
  console.log(headers.map((header) => "-".repeat(header.length)).join(" "));

  rows.forEach((ranking, index) => {
    console.log(
      [
        pad(String(index + 1), 6),
        pad(ranking.symbol, 18),
        pad(ranking.dominantRegime, 10),
        pad(ranking.consistencyScore.toFixed(2), 8),
        pad(ranking.consistencyRatio.toFixed(2), 8),
        pad(ranking.dominantConfidence.toFixed(2), 10),
        pad(formatCounts(ranking), 14),
        formatPredictionSummary(ranking)
      ].join(" ")
    );
  });

  console.log(`\nRanked ${rankings.length} pairs.`);
  if (outputLimit && rankings.length > outputLimit) {
    console.log(`Showing top ${outputLimit}. Set OUTPUT_LIMIT higher or use OUTPUT_FORMAT=json for the full result.`);
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const rankings = await rankPairs(config);

  if (config.outputFormat === "json") {
    console.log(JSON.stringify(rankings, null, 2));
    return;
  }

  printTable(rankings, config.outputLimit);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}

export { loadConfig, rankPairs };
export type { PairRanking } from "./types";