# Ranking Engine

This package loads exchange markets, evaluates each pair across multiple timeframes, and ranks pairs by how consistently those timeframe predictions agree on `bull`, `bear`, or `sideways`.

## What it does

- loads all active spot pairs from the configured exchange
- optionally filters by quote currencies such as `USDT` or `BTC`
- fetches OHLCV candles for every configured timeframe
- classifies each timeframe as `bull`, `bear`, or `sideways`
- scores each pair by dominant-regime agreement, confidence, and separation from the runner-up regime

Pairs with unanimous or near-unanimous timeframe agreement rise to the top of the ranking.

## Install

```bash
cd ranking-engine
npm install
```

## Run

```bash
cd ranking-engine
npm run dev
```

Build and run the compiled output:

```bash
npm run build
npm start
```

## Configuration

- `EXCHANGE_ID`: exchange supported by `ccxt`, default `binance`
- `RANKING_INTERVALS`: comma-separated timeframes, default `15m,1h,4h,1d`
- `LOOKBACK_LIMIT`: candles fetched per timeframe, default `250`
- `RANKING_CONCURRENCY`: number of pairs processed in parallel, default `4`
- `QUOTE_CURRENCIES`: optional comma-separated quote filters such as `USDT,USDC`
- `MAX_PAIRS`: optional cap for testing smaller scans
- `OUTPUT_FORMAT`: `table` or `json`, default `table`
- `OUTPUT_LIMIT`: optional row limit for table output
- `EXCHANGE_TIMEOUT_MS`: per-request timeout in milliseconds, default `30000`
- `EXCHANGE_RETRY_COUNT`: retry count for transient exchange/network failures, default `2`
- `ADX_TREND_THRESHOLD`
- `EMA_SLOPE_THRESHOLD`
- `EMA_SPREAD_THRESHOLD`
- `SIDEWAYS_ATR_THRESHOLD`
- `VOLUME_TREND_THRESHOLD`
- `VOLUME_SIDEWAYS_THRESHOLD`

## Ranking model

Each timeframe receives a regime prediction and confidence score. The pair is then ranked by:

- `consistencyRatio`: fraction of timeframes that agree with the dominant regime
- `dominantConfidence`: average confidence of the dominant regime timeframes
- `agreementMargin`: lead of the dominant regime over the runner-up regime

The final score is:

```text
consistencyScore = consistencyRatio * 70 + dominantConfidence * 25 + agreementMargin * 5
```

That keeps agreement as the primary signal while still preferring stronger setups within the same agreement bucket.