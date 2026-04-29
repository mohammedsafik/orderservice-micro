const express = require('express');
const cors = require('cors');

const config = require('./config/env');
const orderRoutes = require('./routes/orderRoutes');
const AppError = require('./utils/AppError');
const { errorHandler, notFoundHandler } = require('./utils/errorHandler');
const logger = require('./utils/logger');

const app = express();

app.disable('x-powered-by');

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

    callback(new AppError(`Origin ${origin} is not allowed by CORS please ensure req from allowed IP and port`, 403));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: config.cors.allowCredentials,
  maxAge: 86400,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on('finish', () => {
    logger.info('HTTP request completed', {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt
    });
  });

  next();
});

app.get(config.routes.healthPath, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Order Service is healthy'
  });
});

app.use(config.routes.ordersBasePath, orderRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
