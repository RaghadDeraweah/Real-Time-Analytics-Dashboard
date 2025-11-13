import { setTimeout as delay } from 'node:timers/promises';
import { config } from './config.js';
import { logger } from './logger.js';

const controllers = [];

const createServerState = (serverId) => ({
  serverId,
  trend: Math.random(),
  spike: false
});

const states = Array.from({ length: config.serverCount }, (_, idx) =>
  createServerState(`server-${idx + 1}`)
);

const generateMetrics = (state) => {
  const timestamp = Date.now();

  if (Math.random() < config.spikeProbability) {
    state.spike = true;
  } else if (state.spike && Math.random() < 0.3) {
    state.spike = false;
  }

  const base = (Math.sin(timestamp / 60000 + state.trend) + 1) * 35;
  const cpu = clamp(base + randomJitter(10), 0, 100) * (state.spike ? config.spikeMultiplier : 1);
  const memory = clamp(base + randomJitter(15) + 20, 0, 100);
  const disk = clamp(base + randomJitter(20) + 30, 0, 100);

  const networkIn = Math.max(200 + randomJitter(150), 0) * (state.spike ? config.spikeMultiplier : 1);
  const networkOut = Math.max(200 + randomJitter(150), 0);

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

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const randomJitter = (scale) => (Math.random() - 0.5) * scale;
const round = (value) => Number(value.toFixed(2));

const getControllerFor = (serverId) =>
  controllers.find((entry) => entry.serverId === serverId)?.controller;

const sendMetric = async (payload) => {
  try {
    const response = await fetch(config.httpTarget, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: getControllerFor(payload.serverId)?.signal
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status}: ${body}`);
    }

    logger.debug({ serverId: payload.serverId }, 'Metric sent via HTTP');
  } catch (error) {
    if (error.name === 'AbortError') {
      return;
    }
    logger.error({ err: error, serverId: payload.serverId }, 'Failed to send HTTP metric');
  }
};

const scheduleNext = async (state) => {
  const controller = getControllerFor(state.serverId);
  if (!controller || controller.signal.aborted) {
    return;
  }

  const jitter = randomJitter(config.jitterMs);
  await delay(Math.max(config.intervalMs + jitter, 100));

  if (controller.signal.aborted) {
    return;
  }

  const payload = generateMetrics(state);
  await sendMetric(payload);

  if (!controller.signal.aborted) {
    scheduleNext(state).catch((error) => {
    logger.error({ err: error }, 'Error in HTTP sender loop');
  });
  }
};

const start = () => {
  logger.info(
    { servers: config.serverCount, target: config.httpTarget },
    'Starting fake HTTP metric senders'
  );

  for (const state of states) {
    const controller = new AbortController();
    controllers.push({ serverId: state.serverId, controller });
    scheduleNext(state).catch((error) => {
      logger.error({ err: error }, 'Error scheduling HTTP metric sender');
    });
  }
};

const shutdown = () => {
  logger.info('Stopping HTTP metric senders');
  for (const { controller } of controllers) {
    controller.abort();
  }
  process.exit(0);
};

['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, shutdown);
});

start();

