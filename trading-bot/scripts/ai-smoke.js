const { runAiStrategy } = require("../dist/services/aiStrategy");

function makeCandles(kind) {
  const candles = [];
  let price = 100;
  let time = 0;

  for (let index = 0; index < 220; index += 1) {
    const drift = kind === "bull" ? 0.004 : kind === "bear" ? -0.004 : 0;
    const wave = Math.sin(index / 6) * (kind === "sideways" ? 0.003 : 0.0015);
    const move = drift + wave;
    const open = price;
    const close = price * (1 + move);
    const high = Math.max(open, close) * 1.002;
    const low = Math.min(open, close) * 0.998;
    const baseVolume = kind === "sideways" ? 1000 : 1450;
    const volume = baseVolume * (1 + Math.abs(move) * 40 + (kind === "sideways" ? 0.05 : 0.2));

    candles.push({
      openTime: time,
      open,
      high,
      low,
      close,
      volume,
      closeTime: time + 1
    });

    price = close;
    time += 1;
  }

  return candles;
}

async function main() {
  const config = {
    enabled: true,
    epochs: 18,
    lookaheadCandles: 3,
    returnThreshold: 0.006
  };

  for (const regime of ["bull", "bear", "sideways"]) {
    const result = await runAiStrategy(makeCandles(regime), config, regime);
    console.log(regime, JSON.stringify(result));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});