import cluster from 'node:cluster';
import os from 'node:os';
import { config } from './config.js';
import { logger } from './logger.js';

const desiredWorkers = config.workerCount || os.cpus().length;

if (cluster.isPrimary) {
  logger.info(
    { workers: desiredWorkers },
    'Starting System 1 load balancer (cluster primary)'
  );

  for (let i = 0; i < desiredWorkers; i += 1) {
    cluster.fork({ CLUSTER_WORKER_INDEX: String(i) });
  }

  cluster.on('exit', (worker, code, signal) => {
    logger.warn({ pid: worker.process.pid, code, signal }, 'Worker exited');
    // TODO: Add circuit breaker / failure tracking before respawning.
    const newWorker = cluster.fork();
    logger.info({ pid: newWorker.process.pid }, 'Spawned replacement worker');
  });

  const shutdown = (signal) => {
    logger.info({ signal }, 'Primary received shutdown signal');
    for (const id in cluster.workers) {
      cluster.workers[id]?.kill('SIGTERM');
    }
    setTimeout(() => {
      process.exit(0);
    }, config.shutdownTimeoutMs).unref();
  };

  ['SIGINT', 'SIGTERM'].forEach((sig) => {
    process.on(sig, shutdown);
  });
} else {
  logger.info(
    { pid: process.pid, workerIndex: process.env.CLUSTER_WORKER_INDEX },
    'Initialising HTTP worker'
  );
  await import('./server.js');
}

