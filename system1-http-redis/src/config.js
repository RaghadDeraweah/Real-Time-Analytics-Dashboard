import dotenv from 'dotenv';

dotenv.config();

const getNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const requireEnv = (name, fallback) => {
  const value = process.env[name];
  if (value === undefined || value === '') {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  httpPort: getNumber(process.env.SYSTEM1_HTTP_PORT, 4000),
  http2Port: getNumber(process.env.SYSTEM1_HTTP2_PORT, 4001),
  wsPort: getNumber(process.env.SYSTEM1_WS_PORT, 4002),
  workerCount: getNumber(process.env.SYSTEM1_WORKER_COUNT, 2),
  shutdownTimeoutMs: getNumber(process.env.SHUTDOWN_TIMEOUT_MS, 10_000),
  redis: {
    host: requireEnv('SYSTEM1_REDIS_HOST', 'localhost'),
    port: getNumber(process.env.SYSTEM1_REDIS_PORT, 6379),
    db: getNumber(process.env.SYSTEM1_REDIS_DB, 0),
    username: process.env.SYSTEM1_REDIS_USERNAME ?? '',
    password: process.env.SYSTEM1_REDIS_PASSWORD ?? '',
    streamKey: process.env.SYSTEM1_REDIS_STREAM_KEY ?? 'metrics:stream',
    channel: process.env.SYSTEM1_REDIS_CHANNEL ?? 'metrics:pubsub'
  }
};

export default config;

