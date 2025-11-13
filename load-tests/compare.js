import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';

const cwd = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(cwd, 'results');
const outputPath = join(resultsDir, 'comparison-summary.json');

const parseRate = (filename) => {
  const match = filename.match(/(\d+)-report\.json$/);
  return match ? Number(match[1]) : null;
};

const loadReports = async (prefix) => {
  const files = await readdir(resultsDir);
  const reports = {};

  for (const file of files) {
    if (!file.startsWith(prefix) || !file.endsWith('.json')) continue;
    const rate = parseRate(file);
    if (!rate) continue;
    const data = JSON.parse(await readFile(join(resultsDir, file), 'utf8'));
    reports[rate] = data;
  }

  return reports;
};

const buildComparison = (httpReports, wsReports) => {
  const rates = new Set([...Object.keys(httpReports), ...Object.keys(wsReports)].map(Number));
  const rows = [];

  for (const rate of Array.from(rates).sort((a, b) => a - b)) {
    const http = httpReports[rate];
    const ws = wsReports[rate];

    rows.push({
      rate,
      http: http
        ? {
            throughput: http.config?.phases?.[1]?.arrivalRate ?? rate,
            latency: http?.aggregate?.latency ?? null
          }
        : null,
      ws: ws
        ? {
            throughput: ws.totalSent / ws.requestedDurationSeconds,
            latency: ws.latency
          }
        : null
    });
  }

  return rows;
};

const printTable = (rows) => {
  console.log(chalk.bold('\nHTTP vs WebSocket Load Test Comparison\n'));
  console.log(
    chalk.gray(
      'Rate\tHTTP Throughput\tHTTP p95\tWS Throughput\tWS p95'
    )
  );

  for (const row of rows) {
    const httpThroughput = row.http?.throughput ? row.http.throughput.toFixed(1) : '-';
    const httpP95 = row.http?.latency?.p95 ? `${row.http.latency.p95.toFixed(1)} ms` : '-';
    const wsThroughput = row.ws?.throughput ? row.ws.throughput.toFixed(1) : '-';
    const wsP95 = row.ws?.latency?.p95 ? `${row.ws.latency.p95.toFixed(1)} ms` : '-';

    console.log(
      `${row.rate}\t${httpThroughput}\t${httpP95}\t${wsThroughput}\t${wsP95}`
    );
  }
};

const main = async () => {
  const httpReports = await loadReports('http-');
  const wsReports = await loadReports('ws-');

  if (!Object.keys(httpReports).length && !Object.keys(wsReports).length) {
    console.log(chalk.yellow('No reports found. Run the load tests first.'));
    return;
  }

  const comparison = buildComparison(httpReports, wsReports);
  await writeFile(outputPath, JSON.stringify({ comparison }, null, 2));
  printTable(comparison);

  console.log(chalk.green(`\nComparison summary saved to ${outputPath}`));
};

main().catch((error) => {
  console.error(chalk.red('Failed to compare load test results'), error);
  process.exit(1);
});

