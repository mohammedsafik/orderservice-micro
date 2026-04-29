// const express = require('express');
// const cors = require('cors');

// const config = require('./config/env');
// const orderRoutes = require('./routes/orderRoutes');
// const AppError = require('./utils/AppError');
// const { errorHandler, notFoundHandler } = require('./utils/errorHandler');
// const logger = require('./utils/logger');

// const app = express();

// app.disable('x-powered-by');

// const corsOptions = {
//   origin(origin, callback) {
//     if (!origin) {
//       callback(null, true);
//       return;
//     }

//     if (
//       config.cors.allowedOrigins.includes('*') ||
//       config.cors.allowedOrigins.includes(origin)
//     ) {
//       callback(null, true);
//       return;
//     }

//     callback(new AppError(`Origin ${origin} is not allowed by CORS `, 403));
//   },
//   methods: ['GET', 'POST', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization'],
//   credentials: config.cors.allowCredentials,
//   maxAge: 86400,
//   optionsSuccessStatus: 204
// };

// app.use(cors(corsOptions));
// app.options('*', cors(corsOptions));

// app.use(express.json({ limit: '1mb' }));
// app.use(express.urlencoded({ extended: false }));

// app.use((req, res, next) => {
//   const startedAt = Date.now();

//   res.on('finish', () => {
//     logger.info('HTTP request completed', {
//       method: req.method,
//       path: req.originalUrl,
//       statusCode: res.statusCode,
//       durationMs: Date.now() - startedAt
//     });
//   });

//   next();
// });

// app.get(config.routes.healthPath, (req, res) => {
//   res.status(200).json({
//     success: true,
//     message: 'Order Service is healthy'
//   });
// });

// app.use(config.routes.ordersBasePath, orderRoutes);

// app.use(notFoundHandler);
// app.use(errorHandler);

// module.exports = app;
const express = require('express');
const cors = require('cors');
const client = require('prom-client');

const config = require('./config/env');
const orderRoutes = require('./routes/orderRoutes');
const AppError = require('./utils/AppError');
const { errorHandler, notFoundHandler } = require('./utils/errorHandler');
const logger = require('./utils/logger');

const app = express();

app.disable('x-powered-by');

// ===================== PROMETHEUS SETUP =====================

// collect default system metrics
client.collectDefaultMetrics();

// HTTP request counter
const httpRequests = new client.Counter({
name: 'http_requests_total',
help: 'Total number of HTTP requests',
labelNames: ['method', 'route', 'status']
});

// HTTP request duration
const httpDuration = new client.Histogram({
name: 'http_request_duration_seconds',
help: 'Duration of HTTP requests in seconds',
labelNames: ['method', 'route', 'status'],
buckets: [0.1, 0.3, 0.5, 1, 2, 5]
});

// ===================== CORS =====================

const corsOptions = {
origin(origin, callback) {
if (!origin) {
callback(null, true);
return;
}


if (
  config.cors.allowedOrigins.includes('*') ||
  config.cors.allowedOrigins.includes(origin)
) {
  callback(null, true);
  return;
}

callback(new AppError(`Origin ${origin} is not allowed by CORS `, 403));


},
methods: ['GET', 'POST', 'OPTIONS'],
allowedHeaders: ['Content-Type', 'Authorization'],
credentials: config.cors.allowCredentials,
maxAge: 86400,
optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ===================== BODY PARSER =====================

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// ===================== METRICS + LOGGING MIDDLEWARE =====================

app.use((req, res, next) => {
const start = Date.now();

res.on('finish', () => {
const duration = (Date.now() - start) / 1000;


// safer route labeling (avoid high cardinality)
const route = req.route?.path || req.baseUrl || req.path;

httpRequests.inc({
  method: req.method,
  route: route,
  status: res.statusCode
});

httpDuration.observe(
  {
    method: req.method,
    route: route,
    status: res.statusCode
  },
  duration
);

logger.info('HTTP request completed', {
  method: req.method,
  path: req.originalUrl,
  statusCode: res.statusCode,
  durationMs: Date.now() - start
});

});

next();
});

// ===================== METRICS ENDPOINT =====================

app.get('/metrics', async (req, res) => {
res.set('Content-Type', client.register.contentType);
res.end(await client.register.metrics());
});

// ===================== HEALTH =====================

app.get(config.routes.healthPath, (req, res) => {
res.status(200).json({
success: true,
message: 'Order Service is healthy'
});
});

// ===================== ROUTES =====================

app.use(config.routes.ordersBasePath, orderRoutes);

// ===================== ERROR HANDLING =====================

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
