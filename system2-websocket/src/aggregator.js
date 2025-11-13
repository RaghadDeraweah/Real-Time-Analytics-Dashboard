const DEFAULT_WINDOWS = [1000, 5000, 10000];

export class MetricAggregator {
  constructor({ windows = DEFAULT_WINDOWS, bufferSize = 500 } = {}) {
    this.windows = windows;
    this.bufferSize = bufferSize;
    this.store = new Map(); // serverId -> {buffer: Array, index: number, filled: boolean}
  }

  addMetric(metric) {
    const { serverId, timestamp, metrics } = metric;
    if (!this.store.has(serverId)) {
      this.store.set(serverId, {
        buffer: new Array(this.bufferSize),
        index: 0,
        filled: false
      });
    }

    const bucket = this.store.get(serverId);
    bucket.buffer[bucket.index] = { timestamp, metrics };
    bucket.index = (bucket.index + 1) % this.bufferSize;
    if (bucket.index === 0) {
      bucket.filled = true;
    }

    return this.buildAggregates(serverId, timestamp);
  }

  buildAggregates(serverId, referenceTimestamp = Date.now()) {
    const bucket = this.store.get(serverId);
    if (!bucket) {
      return null;
    }

    const entries = this.iterateBuffer(bucket);
    const aggregates = {};

    for (const windowMs of this.windows) {
      const windowStart = referenceTimestamp - windowMs;
      let count = 0;
      const totals = {
        cpu: 0,
        memory: 0,
        disk: 0,
        networkIn: 0,
        networkOut: 0
      };

      for (const entry of entries) {
        if (!entry || entry.timestamp < windowStart) {
          continue;
        }
        count += 1;
        totals.cpu += entry.metrics.cpu ?? 0;
        totals.memory += entry.metrics.memory ?? 0;
        totals.disk += entry.metrics.disk ?? 0;
        totals.networkIn += entry.metrics.network?.in ?? 0;
        totals.networkOut += entry.metrics.network?.out ?? 0;
      }

      aggregates[windowMs] = {
        samples: count,
        averages: count
          ? {
              cpu: totals.cpu / count,
              memory: totals.memory / count,
              disk: totals.disk / count,
              networkIn: totals.networkIn / count,
              networkOut: totals.networkOut / count
            }
          : null
      };
    }

    return {
      serverId,
      timestamp: referenceTimestamp,
      windows: aggregates
    };
  }

  getSnapshot(serverId) {
    const bucket = this.store.get(serverId);
    if (!bucket) {
      return null;
    }

    const latestEntry = this.iterateBuffer(bucket)[0];
    if (!latestEntry) {
      return null;
    }

    return this.buildAggregates(serverId, latestEntry.timestamp);
  }

  getAllSnapshots() {
    const results = [];
    for (const serverId of this.store.keys()) {
      const snapshot = this.getSnapshot(serverId);
      if (snapshot) {
        results.push(snapshot);
      }
    }
    return results;
  }

  iterateBuffer(bucket) {
    const entries = [];
    const { buffer, index, filled } = bucket;
    const length = filled ? buffer.length : index;

    for (let i = 1; i <= length; i += 1) {
      const pos = (index - i + buffer.length) % buffer.length;
      const value = buffer[pos];
      if (value) {
        entries.push(value);
      }
    }

    return entries;
  }
}

export default MetricAggregator;

