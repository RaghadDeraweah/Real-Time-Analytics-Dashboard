import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { logger } from './logger.js';
import { MetricAggregator } from './aggregator.js';

const WINDOW_BASE = config.aggregationWindowMs;
const aggregator = new MetricAggregator({
  windows: [WINDOW_BASE, WINDOW_BASE * 5, WINDOW_BASE * 10],
  bufferSize: config.bufferSize
});

const wss = new WebSocketServer({ port: config.wsPort });
const clients = new Set();

const heartbeatIntervalMs = 30_000;

const sendJson = (socket, payload) => {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
};

const broadcast = (payload, filter = () => true) => {
  for (const client of clients) {
    if (client.socket.readyState === client.socket.OPEN && filter(client)) {
      sendJson(client.socket, payload);
    }
  }
};

const validateMetricMessage = (msg) => {
  const errors = [];
  if (typeof msg.serverId !== 'string' || msg.serverId.length === 0) {
    errors.push('serverId must be a non-empty string');
  }
  if (typeof msg.timestamp !== 'number') {
    errors.push('timestamp must be a number');
  }
  if (typeof msg.metrics !== 'object' || msg.metrics === null) {
    errors.push('metrics must be an object');
  }
  return errors;
};

wss.on('connection', (socket) => {
  const clientMeta = {
    socket,
    role: 'producer', // default role
    serverFilter: null,
    alive: true
  };

  clients.add(clientMeta);
  logger.info('System 2 client connected');

  sendJson(socket, { type: 'connection.ack', message: 'Connected to System 2 WebSocket server' });

  socket.on('pong', () => {
    clientMeta.alive = true;
  });

  socket.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      logger.warn('Received invalid JSON payload');
      sendJson(socket, { type: 'error', message: 'Invalid JSON payload' });
      return;
    }

    switch (message.type) {
      case 'register':
        clientMeta.role = message.role === 'dashboard' ? 'dashboard' : 'producer';
        clientMeta.serverFilter = message.serverId ?? null;
        sendJson(socket, { type: 'register.ack', role: clientMeta.role, serverFilter: clientMeta.serverFilter });
        break;

      case 'metric': {
        const validationErrors = validateMetricMessage(message);
        if (validationErrors.length > 0) {
          sendJson(socket, { type: 'error', message: 'Invalid metric payload', details: validationErrors });
          return;
        }

        const aggregated = aggregator.addMetric({
          serverId: message.serverId,
          timestamp: message.timestamp,
          metrics: message.metrics
        });

        // TODO: Add anomaly detection or enrichment before broadcasting.

        broadcast(
          {
            type: 'metric.update',
            payload: aggregated
          },
          (client) =>
            client.role === 'dashboard' &&
            (client.serverFilter === null || client.serverFilter === message.serverId)
        );

        sendJson(socket, { type: 'metric.ack', serverId: message.serverId });
        break;
      }

      case 'snapshot.request': {
        const serverId = message.serverId ?? null;
        if (serverId) {
          const snapshot = aggregator.getSnapshot(serverId);
          sendJson(socket, { type: 'snapshot', payload: snapshot });
        } else {
          sendJson(socket, { type: 'snapshot', payload: aggregator.getAllSnapshots() });
        }
        break;
      }

      default:
        sendJson(socket, { type: 'error', message: 'Unknown message type' });
        break;
    }
  });

  socket.on('close', () => {
    clients.delete(clientMeta);
    logger.info('System 2 client disconnected');
  });

  socket.on('error', (error) => {
    logger.warn({ err: error }, 'System 2 socket error');
  });
});

const heartbeat = setInterval(() => {
  for (const client of clients) {
    if (client.alive === false) {
      logger.warn('Terminating stale connection');
      client.socket.terminate();
      clients.delete(client);
      continue;
    }

    client.alive = false;
    client.socket.ping();
  }
}, heartbeatIntervalMs);

const gracefulShutdown = async (signal) => {
  logger.info({ signal }, 'System 2 shutting down');
  clearInterval(heartbeat);

  for (const client of clients) {
    try {
      client.socket.close(1001, 'Server shutting down');
    } catch (error) {
      logger.warn({ err: error }, 'Error closing client socket');
    }
  }

  wss.close(() => {
    logger.info('System 2 WebSocket server closed');
    process.exit(0);
  });
};

['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => {
    gracefulShutdown(sig).catch((error) => {
      logger.error({ err: error }, 'Error during System 2 shutdown');
      process.exit(1);
    });
  });
});

logger.info({ port: config.wsPort }, 'System 2 WebSocket server listening');

