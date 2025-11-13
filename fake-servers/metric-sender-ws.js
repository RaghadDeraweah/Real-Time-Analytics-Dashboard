import { WebSocket } from 'ws';
import { setTimeout as delay } from 'node:timers/promises';
import { config } from './config.js';
import { logger } from './logger.js';

const sockets = [];

const createServerState = (serverId) => ({
  serverId,
  trend: Math.random(),
  spike: false
});

const states = Array.from({ length: config.serverCount }, (_, idx) =>
  createServerState(`server-${idx + 1}`)
);

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const randomJitter = (scale) => (Math.random() - 0.5) * scale;
const round = (value) => Number(value.toFixed(2));

const generateMetrics = (state) => {
  const timestamp = Date.now();
  if (Math.random() < config.spikeProbability) {
    state.spike = true;
  } else if (state.spike && Math.random() < 0.3) {
    state.spike = false;
  }

  const base = (Math.cos(timestamp / 45000 + state.trend) + 1) * 40;
  const cpu = clamp(base + randomJitter(12), 0, 100) * (state.spike ? config.spikeMultiplier : 1);
  const memory = clamp(base + randomJitter(10) + 25, 0, 100);
  const disk = clamp(base + randomJitter(18) + 35, 0, 100);
  const networkIn = Math.max(300 + randomJitter(200), 0) * (state.spike ? config.spikeMultiplier : 1);
  const networkOut = Math.max(250 + randomJitter(150), 0);

  return {
    serverId: state.serverId,
    timestamp,
    metrics: {
      cpu: round(cpu),
      memory: round(memory),
      disk: round(disk),
      network: {
        in: Math.round(networkIn),
        out: Math.round(networkOut)
      }
    }
  };
};

const connect = (state) =>
  new Promise((resolve) => {
    const socket = new WebSocket(config.wsTarget);

    socket.once('open', () => {
      logger.info({ serverId: state.serverId }, 'Connected to WebSocket target');
      socket.send(
        JSON.stringify({
          type: 'register',
          role: 'producer',
          serverId: state.serverId
        })
      );
      resolve(socket);
    });

    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'error') {
          logger.warn({ serverId: state.serverId, message }, 'Received error from server');
        }
      } catch (error) {
        logger.warn({ err: error }, 'Failed to parse incoming WS message');
      }
    });

    socket.on('close', () => {
      logger.warn({ serverId: state.serverId }, 'Socket closed, will reconnect');
      setTimeout(() => reconnect(state), 1000);
    });

    socket.on('error', (error) => {
      logger.error({ err: error, serverId: state.serverId }, 'WebSocket error');
    });

    sockets.push({ serverId: state.serverId, socket });
  });

const reconnect = async (state) => {
  const existing = sockets.find((entry) => entry.serverId === state.serverId);
  if (existing) {
    sockets.splice(sockets.indexOf(existing), 1);
  }
  await connect(state);
  loop(state).catch((error) => {
    logger.error({ err: error }, 'Error in WS metric loop after reconnect');
  });
};

const getSocket = (serverId) => sockets.find((entry) => entry.serverId === serverId)?.socket;

const loop = async (state) => {
  const socket = getSocket(state.serverId);
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  const jitter = randomJitter(config.jitterMs);
  await delay(Math.max(config.intervalMs + jitter, 100));

  const payload = generateMetrics(state);
  socket.send(
    JSON.stringify({
      type: 'metric',
      ...payload
    })
  );

  loop(state).catch((error) => {
    logger.error({ err: error }, 'Error in WS sender loop');
  });
};

const start = async () => {
  logger.info({ servers: config.serverCount, target: config.wsTarget }, 'Starting WS metric senders');
  for (const state of states) {
    await connect(state);
    loop(state).catch((error) => {
      logger.error({ err: error }, 'Failed to start WS sender loop');
    });
  }
};

const shutdown = () => {
  logger.info('Shutting down WS metric senders');
  for (const { socket } of sockets) {
    try {
      socket.close(1001, 'Client shutdown');
    } catch (error) {
      logger.warn({ err: error }, 'Error closing socket');
    }
  }
  process.exit(0);
};

['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, shutdown);
});

start().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start WS senders');
  process.exit(1);
});

