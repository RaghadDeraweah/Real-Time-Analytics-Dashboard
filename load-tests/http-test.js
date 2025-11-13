import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const cwd = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(cwd, 'results');
const loadLevels = [100, 1000, 5000, 10000];
const target = process.env.LOAD_TEST_TARGET_HTTP ?? 'http://localhost:4000/metrics';
const duration = Number(process.env.LOAD_TEST_DURATION ?? 60);

const require = createRequire(import.meta.url);
const artilleryPkg = require.resolve('artillery');

const ensureRequirements = () => {
  if (!artilleryPkg) {
    throw new Error('Artillery is not installed. Run `npm install` inside load-tests.');
  }
};

const createTestScript = (arrivalRate) => ({
  config: {
    target,
    phases: [
      { duration: 5, arrivalRate: Math.max(10, Math.floor(arrivalRate * 0.1)), name: 'warm-up' },
      { duration, arrivalRate, name: `${arrivalRate} rps` },
      { duration: 5, arrivalRate: Math.max(10, Math.floor(arrivalRate * 0.2)), name: 'cool-down' }
    ],
    defaults: {
      headers: { 'Content-Type': 'application/json' }
    },
    environments: {},
    plugins: {
      ensure: {
        thresholds: {
          http: {
            'p95': 1000
          }
        }
      }
    }
  },
  scenarios: [
    {
      name: 'Metric ingestion',
      flow: [
        {
          post: {
            url: '/',
            json: {
              serverId: 'test-server-{{ $randomNumber(1,10) }}',
              timestamp: '{{ $now() }}',
              metrics: {
                cpu: '{{ $randomNumber(0,100) }}',
                memory: '{{ $randomNumber(0,100) }}',
                disk: '{{ $randomNumber(0,100) }}',
                network: {
                  in: '{{ $randomNumber(0,5000) }}',
                  out: '{{ $randomNumber(0,5000) }}'
                }
              }
            }
          }
        }
      ]
    }
  ]
});

const runArtillery = (scriptPath, outputPath) =>
  new Promise((resolve, reject) => {
    const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const child = spawn(executable, ['artillery', 'run', scriptPath, '--output', outputPath], {
      stdio: 'inherit',
      cwd
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Artillery exited with code ${code}`));
      }
    });
  });

const main = async () => {
  ensureRequirements();
  await mkdir(resultsDir, { recursive: true });

  for (const rate of loadLevels) {
    const script = createTestScript(rate);
    const scriptPath = join(resultsDir, `http-${rate}-config.json`);
    const outputPath = join(resultsDir, `http-${rate}-report.json`);

    await writeFile(scriptPath, JSON.stringify(script, null, 2), 'utf8');
    console.log(chalk.cyan(`Running HTTP test at ${rate} rps`));

    try {
      await runArtillery(scriptPath, outputPath);
    } catch (error) {
      console.error(chalk.red(`HTTP test failed for ${rate} rps`), error);
    }
  }

  console.log(chalk.green('HTTP load tests complete. Reports saved to load-tests/results.'));
};

main().catch((error) => {
  console.error(chalk.red('Failed to execute HTTP load tests'), error);
  process.exit(1);
});

