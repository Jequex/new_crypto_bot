import { loadConfig } from "./config";
import { saveRankingSnapshot } from "./services/database";
import { rankPairs } from "./services/rankingEngine";
import { PairRanking } from "./types";

let shuttingDown = false;

function formatError(error: unknown): string {
  if (error instanceof AggregateError) {
    const nestedMessages = error.errors
      .map((nestedError) => formatError(nestedError))
      .filter((message) => message.length > 0);

    if (nestedMessages.length > 0) {
      return nestedMessages.join(" | ");
    }
  }

  if (error instanceof Error) {
    if (error.stack && error.stack.trim().length > 0) {
      return error.stack;
    }

    if (error.message.trim().length > 0) {
      return error.message;
    }

    return error.name;
  }

  if (typeof error === "string") {
    return error;
  }

  return JSON.stringify(error);
}

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function installSignalHandlers(): void {
  const handleSignal = (signal: string): void => {
    if (!shuttingDown) {
      shuttingDown = true;
      console.log(`Received ${signal}. Ranking engine will stop after the current cycle.`);
    }
  };

  process.on("SIGINT", () => handleSignal("SIGINT"));
  process.on("SIGTERM", () => handleSignal("SIGTERM"));
}

async function runCycle(): Promise<number> {
  const config = await loadConfig();
  const databaseUrl = process.env.DATABASE_URL;

  console.log(
    `Starting ranking cycle for ${config.exchangeId} on [${config.intervals.join(", ")}] with concurrency ${config.concurrency}.`
  );

  const rankings = await rankPairs(config);

  if (databaseUrl) {
    await saveRankingSnapshot(databaseUrl, {
      exchangeId: config.exchangeId,
      intervals: config.intervals,
      rankings
    });
  }

  if (config.outputFormat === "json") {
    console.log(JSON.stringify(rankings, null, 2));
  } else {
    printTable(rankings, config.outputLimit);
  }

  return config.runIntervalMs;
}

async function main(): Promise<void> {
  installSignalHandlers();

  while (!shuttingDown) {
    let runIntervalMs = 300000;

    try {
      runIntervalMs = await runCycle();
    } catch (error: unknown) {
      const message = formatError(error);
      console.error(`Ranking cycle failed: ${message}`);
    }

    if (shuttingDown) {
      break;
    }

    console.log(`Next ranking cycle in ${Math.round(runIntervalMs / 1000)} seconds.`);
    await sleep(runIntervalMs);
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = formatError(error);
    console.error(message);
    process.exitCode = 1;
  });
}

export { loadConfig, rankPairs };
export type { PairRanking } from "./types";