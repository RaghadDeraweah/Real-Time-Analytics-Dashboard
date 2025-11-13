import { WebSocketServer } from 'ws';
import Redis from 'ioredis';
import { config } from './config.js';
import { logger } from './logger.js';

const redisSubscriber = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  db: config.redis.db,
  username: config.redis.username || undefined,
  password: config.redis.password || undefined
});

const redisPublisher = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  db: config.redis.db,
  username: config.redis.username || undefined,
  password: config.redis.password || undefined
});

redisSubscriber.on('error', (err) => logger.error({ err }, 'Redis subscriber error'));
redisPublisher.on('error', (err) => logger.error({ err }, 'Redis publisher error'));

await redisSubscriber.subscribe(config.redis.channel);

const wss = new WebSocketServer({ port: config.wsPort });

const clients = new Set();

wss.on('connection', (socket) => {
  logger.info('Dashboard client connected');
  const clientMeta = { socket, serverFilter: null };
  clients.add(clientMeta);

  socket.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (message.type === 'subscribe') {
        clientMeta.serverFilter = message.serverId ?? null;
        logger.info(
          { serverFilter: clientMeta.serverFilter },
          'Client subscription updated'
        );
        socket.send(
          JSON.stringify({
            type: 'subscription.ack',
            serverId: clientMeta.serverFilter
          })
        );
      } else if (message.type === 'snapshot.request') {
        // TODO: Respond with cached latest metrics per server from Redis.
        socket.send(
          JSON.stringify({
            type: 'error',
            message: 'Snapshot endpoint not yet implemented'
          })
        );
      } else {
        logger.debug({ message }, 'Received unhandled client message');
      }
    } catch (error) {
      logger.warn({ err: error }, 'Failed to process client message');
      socket.send(
        JSON.stringify({ type: 'error', message: 'Malformed client message' })
      );
    }
  });

  socket.on('close', () => {
    clients.delete(clientMeta);
    logger.info('Dashboard client disconnected');
  });

  socket.on('error', (error) => {
    logger.warn({ err: error }, 'WebSocket client error');
  });
});

redisSubscriber.on('message', (channel, message) => {
  logger.debug({ channel }, 'Publishing message to dashboard clients');
  let parsed;
  try {
    parsed = JSON.parse(message);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to parse pub/sub message, broadcasting raw');
  }

  for (const client of clients) {
    const { socket, serverFilter } = client;
    if (socket.readyState !== socket.OPEN) {
      continue;
    }

    if (parsed?.payload?.serverId && serverFilter && serverFilter !== parsed.payload.serverId) {
      continue;
    }

    socket.send(parsed ? JSON.stringify(parsed) : message);
  }
});
//    }
//  }
//});

const gracefulShutdown = async (signal) => {
  logger.info({ signal }, 'Shutting down WebSocket server');

  for (const client of clients) {
    client.terminate();
  }

  wss.close();

  try {
    await redisSubscriber.quit();
    await redisPublisher.quit();
  } catch (error) {
    logger.warn({ err: error }, 'Error closing Redis connections');
  }

  process.exit(0);
};

['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => {
    gracefulShutdown(sig).catch((error) => {
      logger.error({ err: error }, 'Error during WebSocket shutdown');
      process.exit(1);
    });
  });
});

logger.info({ port: config.wsPort }, 'WebSocket server ready');

