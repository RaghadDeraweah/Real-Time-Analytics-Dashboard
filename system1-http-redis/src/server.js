import http from 'node:http';
import http2 from 'node:http2';
import express from 'express';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import Redis from 'ioredis';
import { config } from './config.js';
import { logger } from './logger.js';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const metricSchema = {
  type: 'object',
  required: ['serverId', 'timestamp', 'metrics'],
  additionalProperties: false,
  properties: {
    serverId: { type: 'string', minLength: 1 },
    timestamp: { type: 'number' },
    metrics: {
      type: 'object',
      required: ['cpu', 'memory', 'disk'],
      additionalProperties: true,
      properties: {
        cpu: { type: 'number', minimum: 0, maximum: 100 },
        memory: { type: 'number', minimum: 0, maximum: 100 },
        disk: { type: 'number', minimum: 0, maximum: 100 },
        network: {
          type: 'object',
          required: ['in', 'out'],
          properties: {
            in: { type: 'number', minimum: 0 },
            out: { type: 'number', minimum: 0 }
          }
        }
      }
    }
  }
};

const validateMetric = ajv.compile(metricSchema);

const app = express();
app.use(express.json({ limit: '256kb' }));

const redisOptions = {
  host: config.redis.host,
  port: config.redis.port,
  db: config.redis.db,
  username: config.redis.username || undefined,
  password: config.redis.password || undefined
};

const redis = new Redis(redisOptions);

redis.on('error', (err) => logger.error({ err }, 'Redis error'));
redis.on('connect', () => logger.info('Connected to Redis'));

app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', redis: redis.status });
});

app.post('/metrics', async (req, res) => {
  const payload = req.body;

  if (!validateMetric(payload)) {
    logger.warn({ errors: validateMetric.errors }, 'Invalid metric payload');
    return res.status(400).json({ error: 'Invalid payload', details: validateMetric.errors });
  }

  try {
    const entryId = await redis.xadd(
      config.redis.streamKey,
      '*',
      'serverId',
      payload.serverId,
      'timestamp',
      payload.timestamp,
      'metrics',
      JSON.stringify(payload.metrics)
    );

    await redis.publish(
      config.redis.channel,
      JSON.stringify({
        type: 'metric.ingested',
        entryId,
        payload
      })
    );

    res.status(202).json({ status: 'accepted' });
  } catch (error) {
    logger.error({ err: error }, 'Failed to persist metric');
    res.status(500).json({ error: 'Failed to persist metric' });
  }
});

const servers = [];

const startHttpServer = () => {
  const httpServer = http.createServer(app);
  httpServer.listen(config.httpPort, () => {
    logger.info({ port: config.httpPort }, 'HTTP/1.1 server listening');
  });
  servers.push(httpServer);
};

const startHttp2Server = () => {
  // NOTE: For demo purposes we boot an insecure HTTP/2 server. For production,
  // provide TLS cert/key via env vars or mount secrets.
  const http2Server = http2.createServer({}, app);
  http2Server.listen(config.http2Port, () => {
    logger.info({ port: config.http2Port }, 'HTTP/2 server listening');
  });
  servers.push(http2Server);
};

const gracefulShutdown = async (signal) => {
  logger.info({ signal }, 'Received shutdown signal');
  const closePromises = servers.map(
    (srv) =>
      new Promise((resolve) => {
        srv.close((err) => {
          if (err) {
            logger.error({ err }, 'Error closing server');
          }
          resolve();
        });
      })
  );

  await Promise.all(closePromises);

  try {
    await redis.quit();
  } catch (error) {
    logger.warn({ err: error }, 'Error quitting Redis connection');
  }

  setTimeout(() => {
    logger.info('Shutdown complete');
    process.exit(0);
  }, 250).unref();
};

startHttpServer();
startHttp2Server();

['SIGTERM', 'SIGINT'].forEach((sig) => {
  process.on(sig, () => {
    gracefulShutdown(sig).catch((error) => {
      logger.error({ err: error }, 'Error during shutdown');
      process.exit(1);
    });
  });
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  logger.fatal({ err }, 'Unhandled rejection');
  process.exit(1);
});

logger.info('System 1 HTTP server initialised');

