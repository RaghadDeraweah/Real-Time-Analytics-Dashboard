import dotenv from 'dotenv';

dotenv.config();

const getNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  wsPort: getNumber(process.env.SYSTEM2_WS_PORT, 4100),
  aggregationWindowMs: getNumber(process.env.SYSTEM2_AGG_WINDOW_MS, 1000),
  bufferSize: getNumber(process.env.SYSTEM2_BUFFER_SIZE, 500),
  shutdownTimeoutMs: getNumber(process.env.SHUTDOWN_TIMEOUT_MS, 10_000)
};

export default config;

