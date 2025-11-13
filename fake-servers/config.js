import dotenv from 'dotenv';

dotenv.config();

const getNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  serverCount: getNumber(process.env.FAKE_SERVER_COUNT, 10),
  intervalMs: getNumber(process.env.FAKE_SERVER_INTERVAL_MS, 1000),
  httpTarget: process.env.FAKE_HTTP_TARGET ?? 'http://localhost:4000/metrics',
  wsTarget: process.env.FAKE_WS_TARGET ?? 'ws://localhost:4100',
  spikeProbability: Number(process.env.FAKE_SPIKE_PROBABILITY ?? 0.05),
  spikeMultiplier: Number(process.env.FAKE_SPIKE_MULTIPLIER ?? 2),
  jitterMs: getNumber(process.env.FAKE_JITTER_MS, 200)
};

export default config;

