# Crypto Regime Bot

This project contains a TypeScript bot that periodically analyzes a crypto trading pair, classifies the current market regime as `bull`, `bear`, or `sideways`, and can automate regime-based trading.

## How it works

The bot pulls recent candles through `ccxt` and combines these indicators:

- `EMA 20` vs `EMA 50` for short-to-medium structure
- `EMA 20 slope` for recent directional acceleration
- `ADX` and `+DI/-DI` for trend strength and direction
- `ATR / price` for volatility compression or expansion
- `RSI` for momentum confirmation
- `Volume / 20-period volume average` for participation confirmation

By default it connects to Binance through `ccxt`, but you can switch to another supported exchange with `EXCHANGE_ID`.

If trend strength is weak and both slope and volatility are muted, the bot marks the market as `sideways`. Otherwise it scores bullish and bearish evidence and picks the stronger regime.

The final decision can also be confirmed by higher timeframes. If the higher timeframes align with the primary signal, confidence increases. If they conflict, confidence drops and the trend can be downgraded to `sideways`.

An AI-enhanced layer also trains a lightweight TensorFlow.js classifier on recent candles and indicator features. That model adds a probabilistic vote for `bull`, `bear`, or `sideways`, which can strengthen or weaken the confirmed regime.

The trading layer uses those predictions as deployment rules:

- `bull` with enough confidence activates the DCA bot
- any non-bull regime disables new entries and closes open DCA positions

If the neural model output is flat or the recent training data has poor class diversity, the bot falls back to a centroid-based classifier instead of silently returning a neutral prediction.

## Automated trading behavior

The trading engine is stateful and persists balances, active strategy state, and execution history in PostgreSQL.

### DCA bot

- Used only when the confirmed regime is `bull`
- Opens an initial tranche when bullish conviction clears the configured threshold
- Adds more tranches on subsequent bullish cycles until the configured entry cap is reached
- Can activate trailing take-profit once the profit trigger is reached
- Exits on trailing take-profit, fixed take-profit, stop-loss, or bull regime loss depending on config

### Trading mode

- Default mode is `paper`
- `live` mode is available, but requires exchange API credentials and should only be used after paper validation

## Run the bot

1. Go to the trading-bot folder.
2. Copy `.env.example` to `.env` if you want custom settings.
3. Install dependencies.
4. Start the bot in watch mode.

```bash
cd trading-bot
npm install
cp .env.example .env
npm run dev
```

`npm run dev` now uses `nodemon`, so changes under `trading-bot/src` restart the process automatically.

The default configuration expects PostgreSQL at `postgresql://postgres:postgres@localhost:5432/trading_bot`.

The bot now stores these runtime settings in the database instead of `.env`: exchange, primary symbol, symbol list, interval set, analysis cadence, initial quote balance, and DCA tranche size.

An HTTP API is exposed on port `3000` by default.

## Run with Docker

From the repository root, start the bot and PostgreSQL together:

```bash
docker compose up --build
```

The compose stack includes:

- `db`: PostgreSQL 16 with a persistent named volume
- `trading-bot`: the compiled Node.js bot process

## Frontend app

The repository now includes a React dashboard in `frontend/`.

Run it locally:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server starts on `http://localhost:5173` and proxies API calls to `http://localhost:3000`.

Frontend routes:

- `/`: trading-state cards
- `/pairs/:symbol`: paginated trades for the selected pair

## API endpoints

- `GET /health`: basic health response
- `GET /api/runtime-config`: returns the runtime config stored in `bot_runtime_config`
- `PATCH /api/runtime-config`: updates one or more runtime config fields
- `GET /api/trading-states`: lists persisted trading states with balances, DCA state, and last price
- `GET /api/trading-states/:symbol`: returns one symbol state summary, for example `/api/trading-states/BTC%2FUSDT`
- `GET /api/trades`: returns paginated trade executions for a required `symbol`, with optional `mode`, `page`, and `pageSize` query params

Example runtime config update:

```bash
curl -X PATCH http://localhost:3000/api/runtime-config \
  -H "Content-Type: application/json" \
  -d '{
    "symbols": ["XAN/USDT", "CTA/USDT", "QNT/USDT"],
    "analysisIntervalMs": 60000,
    "dcaTrancheQuote": 150
  }'
```

Example paginated trade query:

```bash
curl "http://localhost:3000/api/trades?symbol=CTA/USDT&page=1&pageSize=20"
```

To inspect recent executions from the database:

```bash
docker compose exec db psql -U postgres -d trading_bot -c "select symbol, side, price, status, timestamp from trade_executions order by timestamp desc limit 20;"
```

To sanity-check the AI path against synthetic bull, bear, and sideways data, run:

```bash
npm run ai:smoke
```

The main bot output now includes both `analysis` and `trading` objects.

## Environment variables

- `EXCHANGE_ID`: Exchange name supported by `ccxt`, for example `binance`, `kraken`, `coinbase`
- `LOOKBACK_LIMIT`: Number of candles to fetch for each analysis cycle
- `ADX_TREND_THRESHOLD`: Minimum ADX to treat the market as trending
- `EMA_SLOPE_THRESHOLD`: Minimum normalized EMA slope for directional conviction
- `EMA_SPREAD_THRESHOLD`: Minimum EMA20/EMA50 spread for bullish or bearish structure
- `SIDEWAYS_ATR_THRESHOLD`: Maximum ATR/price ratio to support a sideways classification
- `VOLUME_TREND_THRESHOLD`: Minimum current-volume to 20-period-average ratio to confirm a trend
- `VOLUME_SIDEWAYS_THRESHOLD`: Maximum current-volume to 20-period-average ratio that supports a sideways call
- `AI_ENABLED`: Enables the AI-enhanced strategy layer
- `AI_EPOCHS`: Training epochs for the lightweight TensorFlow.js model
- `AI_LOOKAHEAD_CANDLES`: How many candles ahead the AI model learns to predict
- `AI_RETURN_THRESHOLD`: Return threshold used to label training samples as bull, bear, or sideways
- `TRADING_ENABLED`: Enables the automated trading layer
- `TRADING_MODE`: `paper` or `live`
- `DATABASE_URL`: PostgreSQL connection string used for trading state and trade history
- Database runtime config: `EXCHANGE_ID`, `SYMBOL`, `SYMBOLS`, `INTERVAL`, `CONFIRMATION_INTERVALS`, `ANALYSIS_INTERVAL_MS`, `INITIAL_QUOTE_BALANCE`, and `DCA_TRANCHE_QUOTE` are now stored in `bot_runtime_config`
- `TRADING_MIN_CONFIDENCE`: Minimum confirmed regime confidence required to activate a strategy
- `INITIAL_BASE_BALANCE`: Starting paper base balance
- `TRADING_FEE_RATE`: Fee assumption for paper and local accounting
- `MAX_TRADE_HISTORY`: Max stored trade executions per symbol in the database
- `CLOSE_ON_BEAR`: If `true`, bear regimes force the bot to stop opening new trades and flatten any open DCA position
- `DCA_MAX_ENTRIES`: Maximum number of DCA tranches in one bull cycle
- `DCA_TAKE_PROFIT_PERCENT`: DCA profit threshold from average entry that triggers fixed take-profit or trailing activation
- `DCA_TRAILING_TAKE_PROFIT_ENABLED`: Enables trailing take-profit after the take-profit trigger is reached
- `DCA_TRAILING_STOP_PERCENT`: Distance between the highest tracked price and the trailing exit stop
- `DCA_STOP_LOSS_PERCENT`: DCA stop-loss threshold from average entry

## Example output

```json
{
  "analysis": {
    "symbol": "BTC/USDT",
    "interval": "1h",
    "regime": "bull",
    "primaryRegime": "bull",
    "timestamp": "2026-03-19T10:00:00.000Z",
    "confidence": 0.89,
    "metrics": {
      "lastClose": 84522.14,
      "ema20": 84111.58,
      "ema50": 83204.33,
      "ema20Slope": 0.0031,
      "emaSpreadPercent": 0.0109,
      "adx": 27.44,
      "plusDI": 29.18,
      "minusDI": 15.02,
      "atrPercent": 0.0112,
      "rsi": 61.45,
      "volumeSma20": 18234.55,
      "volumeRatio": 1.27
    },
    "confirmations": [
      {
        "interval": "4h",
        "regime": "bull",
        "confidence": 0.91,
        "aligned": true
      },
      {
        "interval": "1d",
        "regime": "sideways",
        "confidence": 0.63,
        "aligned": false
      }
    ],
    "aiStrategy": {
      "enabled": true,
      "mode": "neural",
      "regime": "bull",
      "confidence": 0.78,
      "agreedWithPrimary": true,
      "trainingSamples": 187,
      "labelDistribution": {
        "bull": 96,
        "bear": 41,
        "sideways": 50
      },
      "probabilities": {
        "bull": 0.78,
        "bear": 0.11,
        "sideways": 0.11
      }
    },
    "reasons": [
      "EMA20 is above EMA50, indicating upward structure.",
      "Short-term EMA slope is positive.",
      "ADX confirms directional strength with positive DI leadership.",
      "Momentum is constructive based on RSI.",
      "Volume is expanding above its 20-period average, confirming participation.",
      "Most confirmation timeframes support the primary regime.",
      "The AI strategy agrees with the confirmed regime and increases conviction."
    ]
  },
  "trading": {
    "enabled": true,
    "mode": "paper",
    "preferredStrategy": "dca",
    "activeStrategy": "dca",
    "price": 84522.14,
    "executions": [
      {
        "id": "1710842400-ab12cd34",
        "timestamp": "2026-03-19T10:00:00.000Z",
        "mode": "paper",
        "strategy": "dca",
        "side": "buy",
        "price": 84522.14,
        "baseAmount": 0.0029578,
        "quoteAmount": 250,
        "feeAmount": 0.25,
        "status": "filled",
        "reason": "Open DCA bull position."
      }
    ],
    "balances": {
      "base": 0.0029578,
      "quote": 9749.75,
      "feesPaid": 0.25
    },
    "dca": {
      "entries": 1,
      "baseAmount": 0.0029578,
      "quoteSpent": 250.25,
      "avgEntryPrice": 84522.14,
      "lastEntryPrice": 84522.14,
      "trailingTakeProfitActive": false,
      "highestPriceSinceEntry": 84522.14,
      "trailingStopPrice": 0
    },
    "actionablePoints": [
      "Bull regime confirmed. Opened the first DCA tranche."
    ]
  }
}
```

## Actionable points

1. Keep `TRADING_MODE=paper` and let the bot run long enough to generate several bull and non-bull regime changes.
2. Review the `trading_states` and `trade_executions` tables after each session and verify that DCA is only active in bull regimes and that positions are closed whenever the regime stops being bullish.
3. Tune `TRADING_MIN_CONFIDENCE`, `DCA_STEP_PERCENT`, `DCA_TAKE_PROFIT_PERCENT`, and `DCA_STOP_LOSS_PERCENT` for the pair and timeframe you actually trade.
4. Add backtests for both strategies before trusting the automation with capital.
5. Validate fees, order size minimums, and precision rules for your chosen exchange and symbol.
6. Add alerting for skipped trades, bull-entry signals, regime-change exits, and stop-loss exits.
7. Only switch to `TRADING_MODE=live` after paper results and exchange constraints have been validated.