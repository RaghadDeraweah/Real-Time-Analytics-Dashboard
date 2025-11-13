# Performance & Benchmark Log

This document captures performance experiments for both ingestion systems. Use it as a living journal—append new test runs with date, environment details, and observations.

## Template for Each Experiment

```
## YYYY-MM-DD - Short Title
- Environment:
  - Hardware: e.g., 8 vCPU, 16 GB RAM
  - Docker? (yes/no)
  - Redis configuration: e.g., default, cluster, etc.
- Test Scenario:
  - System: system1-http-redis | system2-websocket
  - Load levels: 100 / 1k / 5k / 10k metrics per second
  - Duration: 60s warm-up + 60s steady + 30s cool-down
- Results:
  - Throughput: ...
  - Latency p50/p95/p99: ...
  - Error rate: ...
- Observations:
  - Key takeaways, bottlenecks, anomalies, TODOs.
```

## Sample Entry

```
## 2025-11-13 - Smoke Test (Localhost)
- Environment:
  - Hardware: MacBook Pro M1, 16 GB RAM
  - Docker: yes
  - Redis: single instance (Docker)
- Test Scenario:
  - System: system1-http-redis
  - Load: 100 metrics/second for 2 minutes
- Results:
  - Throughput: 97 msg/s sustained
  - Latency: p50=85 ms, p95=210 ms, p99=340 ms
  - Errors: 0
- Observations:
  - CPU utilization on worker containers hit 70%.
  - TODO: Tune Redis persistence and connection pooling.
```

> **Tip:** Keep raw JSON reports under `load-tests/results/` and summarise insights here for quick reference.

