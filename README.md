# Real-Time Analytics Dashboard (Educational Backend Project)

This project demonstrates multiple backend communication patterns for ingesting, processing, and visualising infrastructure metrics in real time. It is intentionally designed as a learning resource with two contrasting ingestion systems, simulated metric producers, a simple dashboard, and load-testing utilities.

## Features at a Glance

- Two ingestion pipelines:
  - **System 1:** HTTP/1.1 + HTTP/2 endpoints with Redis-backed stateless workers and a WebSocket fan-out.
  - **System 2:** WebSocket ingestion with in-memory aggregation and dashboard push notifications.
- Fake metric servers that generate realistic CPU, memory, disk, and network data with configurable spikes.
- Lightweight dashboard built with vanilla JavaScript and Chart.js.
- Load-testing scripts (Artillery style) to compare throughput and latency across scenarios.
- Docker Compose stack that boots Redis, both systems, optional Nginx, and supporting services.

## Tech Stack

- **Runtime:** Node.js 18+
- **Frameworks & Libraries:** Express.js, ws, ioredis, http2, Chart.js, pino
- **Storage:** Redis (for System 1)
- **Testing:** Artillery (or k6 alternative)
- **DevOps:** Docker, Docker Compose, optional Nginx reverse proxy

## Getting Started

### 1. Clone and Install

```bash
git clone https://github.com/your-handle/real-time-analytics-dashboard.git
cd real-time-analytics-dashboard
npm install
```

Each sub-system also has its own `package.json`. After the root install, run `npm install` inside `system1-http-redis`, `system2-websocket`, `fake-servers`, and `load-tests` to pull scoped dependencies.

### 2. Configure Environment Variables

Copy `.env.example` to `.env` in the project root and in each sub-system directory. Adjust ports, Redis credentials, and other settings to match your environment.

```bash
cp .env.example .env
cp system1-http-redis/.env.example system1-http-redis/.env
cp system2-websocket/.env.example system2-websocket/.env
```

### 3. Run Locally

#### System 1 (HTTP + Redis)

```bash
cd system1-http-redis
npm run dev
```

This starts the Express HTTP server (HTTP/1.1), optional HTTP/2 server, Redis-powered worker processes, and the WebSocket broadcaster. Metrics are persisted to Redis and broadcast to the dashboard.

#### System 2 (WebSocket Only)

```bash
cd system2-websocket
npm run dev
```

This launches the WebSocket ingestion server with in-memory aggregation and a circular buffer for recent metrics.

#### Fake Metric Senders

```bash
cd fake-servers
npm run start:http      # Sends HTTP POST requests
npm run start:ws        # Sends WebSocket messages
```

These scripts spawn configurable workers to generate realistic infrastructure metrics every second.

#### Dashboard

Open `dashboard/index.html` in a modern browser or serve the directory with any static HTTP server (e.g., `npx http-server dashboard`).

### 4. Docker Compose

To boot everything (Redis, systems, fake senders, dashboard, optional Nginx) inside containers:

```bash
npm run docker:up
```

On first run, Docker will build images for each service. Use `npm run docker:down` to stop and remove containers.

### 5. Load Testing

```bash
cd load-tests
npm run test:http       # Artillery HTTP scenario
npm run test:ws         # WebSocket scenario
npm run compare         # Compare outputs from last runs
```

The scripts generate JSON/CSV reports under `load-tests/results`. Use `compare.js` to produce summary comparisons between HTTP/1.1 and HTTP/2 pipelines.

## Architecture Overview

- See `ARCHITECTURE.md` for detailed diagrams, OSI layer mapping, sequence diagrams, and trade-off analysis.
- `docs/diagrams` holds exported diagrams (add your own `.png` files).
- `docs/performance-results.md` is a living document for benchmark findings.

## Contributing

This repository is a teaching aid. Contributions that improve clarity, add comments, or expand the educational value are welcome. Please open an issue or pull request with a summary of your changes.

---

> **TODO:** Implement the remaining business logic in each subsystem (see inline TODO markers). Update documentation as real benchmark data becomes available.

