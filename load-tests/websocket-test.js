import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { WebSocket } from 'ws';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const cwd = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(cwd, 'results');
const loadLevels = [100, 1000, 5000, 10000];
const target = process.env.LOAD_TEST_TARGET_WS ?? 'ws://localhost:4100';
const durationSeconds = Number(process.env.LOAD_TEST_DURATION ?? 60);

const percentiles = (values, percentile) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor((percentile / 100) * (sorted.length - 1));
  return sorted[index];
};

const createMetric = (serverId) => ({
  type: 'metric',
  serverId,
  timestamp: Date.now(),
  metrics: {
    cpu: Math.random() * 100,
    memory: Math.random() * 100,
    disk: Math.random() * 100,
    network: {
      in: Math.random() * 5000,
      out: Math.random() * 5000
    }
  }
});

const runScenario = async (rate) => {
  const clientCount = Math.min(100, Math.max(10, Math.floor(rate / 20)));
  const messagesPerClientPerSecond = Math.ceil(rate / clientCount);
  const clients = [];
  const latencyMeasurements = [];
  let totalSent = 0;

  const startClient = (clientId) =>
    new Promise((resolve, reject) => {
      const ws = new WebSocket(target);

      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            type: 'register',
            role: 'producer',
            serverId: `load-client-${clientId}`
          })
        );

        const interval = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            clearInterval(interval);
            return;
          }
          for (let i = 0; i < messagesPerClientPerSecond; i += 1) {
            const metric = createMetric(`load-client-${clientId}`);
            const start = performance.now();
            ws.send(JSON.stringify(metric), (err) => {
              if (err) {
                return;
              }
              totalSent += 1;
            });
            ws.once('message', () => {
              const latency = performance.now() - start;
              latencyMeasurements.push(latency);
            });
          }
        }, 1000);

        clients.push({ ws, interval });
        resolve();
      });

      ws.on('error', (error) => {
        reject(error);
      });
    });

  for (let i = 0; i < clientCount; i += 1) {
    try {
      await startClient(i + 1);
    } catch (error) {
      console.error(chalk.red('Failed to start WebSocket client'), error);
    }
    await delay(50);
  }

  await delay(durationSeconds * 1000);

  for (const { ws, interval } of clients) {
    clearInterval(interval);
    try {
      ws.close(1000, 'Scenario completed');
    } catch (error) {
      console.warn('Failed to close socket gracefully', error);
    }
  }

  return {
    rate,
    requestedDurationSeconds: durationSeconds,
    totalSent,
    latency: {
      p50: percentiles(latencyMeasurements, 50),
      p95: percentiles(latencyMeasurements, 95),
      p99: percentiles(latencyMeasurements, 99),
      samples: latencyMeasurements.length
    }
  };
};

const main = async () => {
  await mkdir(resultsDir, { recursive: true });
  const reports = [];

  for (const rate of loadLevels) {
    console.log(chalk.cyan(`Running WebSocket test at ${rate} msg/s`));
    try {
      const report = await runScenario(rate);
      reports.push(report);
      const outputPath = join(resultsDir, `ws-${rate}-report.json`);
      await writeFile(outputPath, JSON.stringify(report, null, 2));
    } catch (error) {
      console.error(chalk.red(`WebSocket scenario failed at ${rate} msg/s`), error);
    }
  }

  console.log(chalk.green('WebSocket load tests complete.'));
};

main().catch((error) => {
  console.error(chalk.red('Failed to execute WebSocket load tests'), error);
  process.exit(1);
});

