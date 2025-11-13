# Architecture Overview

This document provides a guided tour of the educational architecture for the Real-Time Analytics Dashboard. It aims to show how different transport protocols, state management approaches, and deployment topologies affect the shape of a real-time monitoring platform.

## 1. High-Level Architecture Diagram

> **TODO:** Create and export a high-level architecture diagram to `docs/diagrams/architecture.png`.
>
> **Suggested elements to include:**
> - Metric sources (fake servers or real agents)
> - System 1 HTTP entry point, Redis, workers, WebSocket broadcaster
> - System 2 WebSocket ingestion and in-memory aggregator
> - Dashboard clients
> - Optional Nginx reverse proxy and Docker network boundaries

## 2. OSI Model Mapping

### System 1 (HTTP/1.1 & HTTP/2)
- **Layer 7 (Application):** HTTP POST `/metrics`, JSON payload, Express middleware.
- **Layer 6 (Presentation):** JSON encoding/decoding, validation, compression (future enhancement).
- **Layer 5 (Session):** TCP connections managed by Node.js http/http2 modules.
- **Layer 4 (Transport):** TCP with optional TLS termination (via Node or Nginx).
- **Layer 3 (Network):** IPv4/IPv6 networking between agents, load balancer, and Redis.
- **Layer 2 (Data Link) & Layer 1 (Physical):** Managed by Docker bridge network or host infrastructure.

### System 2 (WebSocket)
- **Layer 7:** WebSocket protocol (upgraded from HTTP handshake), JSON metrics frames.
- **Layer 6:** UTF-8 encoded JSON messages (binary frames optional).
- **Layer 5:** Persistent WebSocket sessions; heartbeats/pings maintain liveness.
- **Layer 4:** TCP sockets.
- **Layer 3-1:** As above, managed by Docker networking/host.

## 3. Sequence Diagrams

> **TODO:** Produce sequence diagrams and export them to `docs/diagrams/sequence-diagrams.png`.

### 3.1 Metric Ingestion Flow (System 1)
1. Metric source sends HTTP POST `/metrics`.
2. Express server validates payload and publishes to Redis Streams/List.
3. Worker process consumes from Redis, performs aggregation/enrichment, writes snapshots back to Redis (e.g., hashes), and publishes events via Redis Pub/Sub.
4. WebSocket server receives pub/sub events and pushes updates to connected dashboards.
5. Dashboard updates charts in real time.

### 3.2 WebSocket Bidirectional Flow (System 2)
1. Metric source opens WebSocket connection to ingestion server.
2. Server authenticates optional token, registers client.
3. Client sends JSON metric frames at configured interval.
4. Aggregator stores values in circular buffer(s) grouped by aggregation window.
5. Aggregator emits derived metrics back through the same WebSocket (or broadcast to dashboard channels).
6. Dashboard receives frames and updates charts.

### 3.3 Dashboard Update Flow
1. Dashboard connects to WebSocket endpoint (System 1 broadcaster or System 2 direct).
2. Client listens for metric events (per server or aggregated).
3. UI updates charts, connection status, and latency indicators.
4. User switches server filter; client updates local state and chart datasets.

## 4. Design Decisions & Trade-Offs

- **Protocol Diversity:** Demonstrates strengths/weaknesses of HTTP vs WebSocket for telemetry.
- **State Management:** Redis offers durability and decoupling in System 1; System 2 favours low-latency in-memory operations.
- **Scalability:** HTTP workers can scale horizontally via Redis queues; WebSocket system scales vertically but needs clustering (future enhancement: ws + Redis or shared-nothing sharding).
- **Complexity:** System 1 introduces more moving parts (Redis, workers, pub/sub) but illustrates enterprise-grade patterns. System 2 is simpler but trades durability for speed.
- **Load Balancing:** Round-robin load balancer (Node cluster) vs potential Nginx/Redis stream partitioning.
- **Observability:** Logging via pino and structured events; TODO: integrate metrics for the systems themselves.

## 5. Comparison Table

| Aspect                     | System 1: HTTP + Redis              | System 2: WebSocket + In-Memory           |
|----------------------------|-------------------------------------|-------------------------------------------|
| Transport                  | HTTP/1.1, HTTP/2                    | WebSocket                                 |
| State Storage              | Redis (persistent)                  | Process memory (ephemeral)                |
| Scaling Strategy           | Add workers; Redis handles queueing | Add more instances; requires coordination |
| Latency Profile            | Slight overhead from Redis hops     | Minimal (direct memory updates)           |
| Fault Tolerance            | Redis durability; workers restarts  | Lower (memory lost on restart)            |
| Complexity                 | Higher (multiple components)        | Lower (single server process)             |
| Dashboard Fan-out          | Redis Pub/Sub + WebSocket server    | Same WebSocket channel                    |
| Best Use Case              | Critical telemetry, durability      | Ultra-low-latency, ephemeral metrics      |
| Key Trade-Off              | More infra, more resilience         | Simpler infra, less resilience            |

---

> **Next Steps:** Replace TODO markers with references to actual diagrams and expand sections with implementation details as subsystems are built out.

