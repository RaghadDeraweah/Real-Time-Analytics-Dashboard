import Redis from 'ioredis';
import { config } from './config.js';
import { logger } from './logger.js';

const redisOptions = {
  host: config.redis.host,
  port: config.redis.port,
  db: config.redis.db,
  username: config.redis.username || undefined,
  password: config.redis.password || undefined
};

const consumerGroup = 'metrics-workers';
const consumerName = `worker-${process.pid}`;

const redis = new Redis(redisOptions);
const redisWriter = new Redis(redisOptions);

redis.on('error', (err) => logger.error({ err }, 'Redis (reader) error'));
redisWriter.on('error', (err) => logger.error({ err }, 'Redis (writer) error'));

const ensureGroup = async () => {
  try {
    await redis.xgroup('CREATE', config.redis.streamKey, consumerGroup, '0', 'MKSTREAM');
    logger.info({ stream: config.redis.streamKey, consumerGroup }, 'Created consumer group');
  } catch (error) {
    if (!String(error?.message).includes('BUSYGROUP')) {
      throw error;
    }
    logger.debug({ consumerGroup }, 'Consumer group already exists');
  }
};

const processMetric = async (entryId, fields) => {
  const payload = {
    serverId: fields.serverId,
    timestamp: Number(fields.timestamp),
    metrics: JSON.parse(fields.metrics)
  };

  // TODO: Add aggregation logic or persistence (e.g., rolling averages).
  await redisWriter.hset(`metrics:latest:${payload.serverId}`, {
    timestamp: payload.timestamp,
    metrics: JSON.stringify(payload.metrics)
  });

  await redisWriter.publish(
    config.redis.channel,
    JSON.stringify({
      type: 'metric.processed',
      entryId,
      payload
    })
  );
};

const startPolling = async () => {
  await ensureGroup();

  logger.info({ consumerName }, 'Worker started polling');

  while (true) {
    try {
      const response = await redis.xreadgroup(
        'GROUP',
        consumerGroup,
        consumerName,
        'COUNT',
        10,
        'BLOCK',
        5000,
        'STREAMS',
        config.redis.streamKey,
        '>'
      );

      if (!response) {
        continue;
      }

      for (const [, entries] of response) {
        for (const [entryId, pairs] of entries) {
          const fields = {};
          for (let i = 0; i < pairs.length; i += 2) {
            fields[pairs[i]] = pairs[i + 1];
          }

          try {
            await processMetric(entryId, fields);
            await redis.xack(config.redis.streamKey, consumerGroup, entryId);
          } catch (error) {
            logger.error({ err: error, entryId }, 'Failed to process metric entry');
          }
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Error while reading from stream');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
};

const gracefulShutdown = async (signal) => {
  logger.info({ signal }, 'Worker shutting down');
  try {
    await redis.quit();
    await redisWriter.quit();
  } catch (error) {
    logger.warn({ err: error }, 'Error shutting down Redis clients');
  }
  process.exit(0);
};

['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => {
    gracefulShutdown(sig).catch((error) => {
      logger.error({ err: error }, 'Error during worker shutdown');
      process.exit(1);
    });
  });
});

startPolling().catch((error) => {
  logger.fatal({ err: error }, 'Worker crashed during startup');
  process.exit(1);
});

