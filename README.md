# Crypto Regime Bot

This project contains a lightweight TypeScript bot that periodically analyzes a crypto trading pair and classifies the current market regime as `bull`, `bear`, or `sideways`.

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

If the neural model output is flat or the recent training data has poor class diversity, the bot falls back to a centroid-based classifier instead of silently returning a neutral prediction.

## Run the bot

1. Go to the backend folder.
2. Copy `.env.example` to `.env` if you want custom settings.
3. Install dependencies.
4. Start the bot in watch mode.

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

`npm run dev` now uses `nodemon`, so changes under `backend/src` restart the process automatically.

To sanity-check the AI path against synthetic bull, bear, and sideways data, run:

```bash
npm run ai:smoke
```

## Environment variables

- `EXCHANGE_ID`: Exchange name supported by `ccxt`, for example `binance`, `kraken`, `coinbase`
- `SYMBOL`: Trading pair in `ccxt` format, for example `BTC/USDT`
- `INTERVAL`: Exchange timeframe, for example `15m`, `1h`, `4h`
- `CONFIRMATION_INTERVALS`: Comma-separated higher timeframes used to confirm the primary signal, for example `4h,1d`
- `LOOKBACK_LIMIT`: Number of candles to fetch for each analysis cycle
- `ANALYSIS_INTERVAL_MS`: How often to re-run the analysis
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

## Example output

```json
{
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
}
```