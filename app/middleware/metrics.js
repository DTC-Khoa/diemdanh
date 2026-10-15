const client = require('prom-client');

// Khoi tao thu thap metrics mac dinh cua Node.js runtime (CPU, Memory, Event Loop)
client.collectDefaultMetrics({ prefix: 'attendance_app_' });

// Custom metrics cho ung dung diem danh
const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5]
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'code']
});

const attendanceEventsTotal = new client.Counter({
  name: 'attendance_events_total',
  help: 'Total attendance events (check-in, check-out)',
  labelNames: ['type', 'status']
});

const activeSessionsGauge = new client.Gauge({
  name: 'attendance_active_sessions_count',
  help: 'Number of active authenticated sessions'
});

function metricsMiddleware(req, res, next) {
  // Bo qua request /metrics va file tinh
  if (req.path === '/metrics' || req.path.startsWith('/public') || req.path.startsWith('/css') || req.path.startsWith('/js')) {
    return next();
  }

  const start = process.hrtime();

  res.on('finish', () => {
    const elapsed = process.hrtime(start);
    const durationInSeconds = elapsed[0] + elapsed[1] / 1e9;
    const route = req.route ? req.route.path : req.path;
    const statusCode = res.statusCode.toString();

    httpRequestsTotal.inc({ method: req.method, route, code: statusCode });
    httpRequestDurationMicroseconds.observe({ method: req.method, route, code: statusCode }, durationInSeconds);
  });

  next();
}

async function getMetricsEndpoint(req, res) {
  try {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  } catch (ex) {
    res.status(500).end(ex);
  }
}

module.exports = {
  metricsMiddleware,
  getMetricsEndpoint,
  attendanceEventsTotal,
  activeSessionsGauge
};
