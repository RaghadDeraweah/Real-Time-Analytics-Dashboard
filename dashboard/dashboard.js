const charts = initCharts();
const connectionIndicator = document.getElementById('connection-indicator');
const connectionText = document.getElementById('connection-text');
const serverSelect = document.getElementById('server-select');
const systemSelect = document.getElementById('system-select');
const connectButton = document.getElementById('connect-btn');
const throughputValue = document.getElementById('throughput-value');
const latencyValue = document.getElementById('latency-value');

const SAMPLE_SERVERS = ['server-1', 'server-2', 'server-3'];
const MAX_POINTS = 60;

let socket = null;
let lastMessageTimestamp = null;
let messageCount = 0;
let throughputWindow = [];
let sampleTimerId = null;

function initCharts() {
  const makeChart = (ctx, label, color) =>
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label,
            data: [],
            borderColor: color,
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          y: {
            min: 0,
            max: 100
          }
        }
      }
    });

  return {
    cpu: makeChart(document.getElementById('cpu-chart'), 'CPU %', '#40a9ff'),
    memory: makeChart(document.getElementById('memory-chart'), 'Memory %', '#73d13d'),
    disk: makeChart(document.getElementById('disk-chart'), 'Disk %', '#ff7875')
  };
}

function updateChart(chart, value) {
  const label = new Date().toLocaleTimeString();
  chart.data.labels.push(label);
  chart.data.datasets[0].data.push(value);
  if (chart.data.labels.length > MAX_POINTS) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update('none');
}

function setConnectionStatus(status) {
  connectionIndicator.classList.toggle('online', status === 'online');
  connectionIndicator.classList.toggle('offline', status !== 'online');
  connectionText.textContent = status === 'online' ? 'Connected' : 'Disconnected';
}

function populateServerDropdown() {
  serverSelect.innerHTML = '<option value="all">All Servers</option>';
  SAMPLE_SERVERS.forEach((serverId) => {
    const option = document.createElement('option');
    option.value = serverId;
    option.textContent = serverId;
    serverSelect.appendChild(option);
  });
}

function computeStats() {
  const now = Date.now();
  throughputWindow = throughputWindow.filter((ts) => now - ts < 1000);
  throughputValue.textContent = `${throughputWindow.length} msg/s`;

  if (lastMessageTimestamp) {
    const latency = now - lastMessageTimestamp;
    latencyValue.textContent = `${latency} ms`;
  }
}

function startStatsLoop() {
  setInterval(computeStats, 1000);
}

function handleMetricUpdate(payload) {
  const data = normaliseMetricPayload(payload);
  if (!data) return;

  throughputWindow.push(Date.now());
  lastMessageTimestamp = Date.now();
  messageCount += 1;

  updateChart(charts.cpu, data.metrics.cpu);
  updateChart(charts.memory, data.metrics.memory);
  updateChart(charts.disk, data.metrics.disk);
}

function normaliseMetricPayload(payload) {
  if (!payload) {
    return null;
  }

  if (payload.payload?.windows) {
    // System 2 aggregate payload
    const windowKey = Object.keys(payload.payload.windows)[0];
    const windowData = payload.payload.windows[windowKey];
    if (!windowData?.averages) {
      return null;
    }
    return {
      serverId: payload.payload.serverId,
      timestamp: payload.payload.timestamp,
      metrics: {
        cpu: Number(windowData.averages.cpu?.toFixed(2)),
        memory: Number(windowData.averages.memory?.toFixed(2)),
        disk: Number(windowData.averages.disk?.toFixed(2))
      }
    };
  }

  if (payload.payload?.metrics && payload.payload?.serverId) {
    return payload.payload;
  }

  return payload;
}

function connect() {
  const system = systemSelect.value;
  const serverFilter = serverSelect.value;
  const url = system === 'system1' ? 'ws://localhost:4002' : 'ws://localhost:4100';

  if (sampleTimerId) {
    clearInterval(sampleTimerId);
    sampleTimerId = null;
  }

  if (socket) {
    socket.close(1000, 'Reconnecting');
    socket = null;
  }

  setConnectionStatus('offline');
  connectionText.textContent = 'Connecting...';

  socket = new WebSocket(url);

  socket.addEventListener('open', () => {
    setConnectionStatus('online');
    const registrationPayload =
      system === 'system1'
        ? { type: 'subscribe', serverId: serverFilter === 'all' ? null : serverFilter }
        : {
            type: 'register',
            role: 'dashboard',
            serverId: serverFilter === 'all' ? null : serverFilter
          };

    socket.send(JSON.stringify(registrationPayload));
  });

  socket.addEventListener('message', (event) => {
    try {
      const payload = JSON.parse(event.data);
      switch (payload.type) {
        case 'metric.update':
        case 'metric.processed':
        case 'metric.ingested':
          handleMetricUpdate(payload);
          break;
        default:
          break;
      }
    } catch (error) {
      console.error('Failed to parse message', error);
    }
  });

  socket.addEventListener('close', () => {
    setConnectionStatus('offline');
    if (!sampleTimerId) {
      seedSampleData();
    }
  });

  socket.addEventListener('error', () => {
    setConnectionStatus('offline');
    if (!sampleTimerId) {
      seedSampleData();
    }
  });
}

function seedSampleData() {
  let t = 0;
  if (sampleTimerId) {
    clearInterval(sampleTimerId);
  }
  sampleTimerId = setInterval(() => {
    t += 1;
    const cpu = Math.abs(Math.sin(t / 10)) * 80 + Math.random() * 10;
    const memory = Math.abs(Math.cos(t / 15)) * 70 + Math.random() * 10;
    const disk = Math.abs(Math.sin(t / 20)) * 60 + Math.random() * 5;

    updateChart(charts.cpu, Number(cpu.toFixed(2)));
    updateChart(charts.memory, Number(memory.toFixed(2)));
    updateChart(charts.disk, Number(disk.toFixed(2)));
  }, 1500);
}

connectButton.addEventListener('click', () => {
  connect();
});

populateServerDropdown();
seedSampleData(); // TODO: Remove once connected to live data by default.
startStatsLoop();

