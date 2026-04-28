const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const initialNodeEnv = process.env.NODE_ENV || 'development';
const envFiles = [
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, `../.env.${initialNodeEnv}`)
];

envFiles.forEach((filePath) => {
  if (fs.existsSync(filePath)) {
    dotenv.config({
      path: filePath,
      override: true
    });
  }
});

const nodeEnv = process.env.NODE_ENV || initialNodeEnv;
const isProduction = nodeEnv === 'production';

const requiredEnvVars = ['MONGODB_URI'];

requiredEnvVars.forEach((variableName) => {
  if (!process.env[variableName]) {
    throw new Error(`Missing required environment variable: ${variableName}`);
  }
});

const parsePositiveNumber = (value, fallbackValue) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallbackValue;
};

const parseCsv = (value, fallbackValue) => {
  const source = value || fallbackValue || '';

  return source
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const parseBoolean = (value, fallbackValue = false) => {
  if (value === undefined) {
    return fallbackValue;
  }

  return String(value).trim().toLowerCase() === 'true';
};

const parseString = (value, fallbackValue = '') => {
  if (typeof value !== 'string') {
    return fallbackValue;
  }

  const normalizedValue = value.trim();
  return normalizedValue || fallbackValue;
};

const parseRoutePath = (value, fallbackValue) => {
  const routePath = parseString(value, fallbackValue);

  if (!routePath) {
    return '';
  }

  return routePath.startsWith('/') ? routePath : `/${routePath}`;
};

const kafkaBrokers = parseCsv(
  process.env.KAFKA_BROKERS,
  isProduction ? '' : '192.168.1.17:9092'
);

if (kafkaBrokers.length === 0) {
  throw new Error('Missing required environment variable: KAFKA_BROKERS');
}

module.exports = {
  nodeEnv,
  host: parseString(process.env.HOST, '0.0.0.0'),
  port: parsePositiveNumber(process.env.PORT, 5000),
  grpc: {
    host: parseString(process.env.GRPC_HOST, '0.0.0.0'),
    port: parsePositiveNumber(process.env.GRPC_PORT, 50051)
  },
  routes: {
    healthPath: parseRoutePath(process.env.HEALTH_ROUTE_PATH, '/health'),
    ordersBasePath: parseRoutePath(process.env.ORDERS_ROUTE_PATH, '/api/orders')
  },
  mongoUri: process.env.MONGODB_URI,
  auth: {
    serviceUrl: parseString(process.env.AUTH_SERVICE_URL, ''),
    userEmailPath: parseRoutePath(
      process.env.AUTH_USER_EMAIL_PATH,
      '/api/users/{userId}'
    ),
    userEmailField: parseString(process.env.AUTH_USER_EMAIL_FIELD, 'email'),
    timeoutMs: parsePositiveNumber(process.env.AUTH_SERVICE_TIMEOUT_MS, 5000)
  },
  cors: {
    allowedOrigins: parseCsv(
      process.env.CORS_ALLOWED_ORIGINS,
      isProduction
        ? ''
        : 'http://192.168.1.17:3000,http://192.168.1.17:4200,http://192.168.1.17:5173'
    ),
    allowCredentials: parseBoolean(process.env.CORS_ALLOW_CREDENTIALS, false)
  },
  kafka: {
    clientId: parseString(process.env.KAFKA_CLIENT_ID, 'order-service'),
    brokers: kafkaBrokers,
    consumerGroupId: parseString(
      process.env.KAFKA_CONSUMER_GROUP,
      'order-service-group'
    ),
    orderEventsTopic: parseString(process.env.ORDER_EVENTS_TOPIC, 'order-events'),
    inventoryEventsTopic: parseString(
      process.env.INVENTORY_EVENTS_TOPIC,
      'inventory-events'
    ),
    retryAttempts: parsePositiveNumber(process.env.KAFKA_RETRY_ATTEMPTS, 3),
    retryDelayMs: parsePositiveNumber(process.env.KAFKA_RETRY_DELAY_MS, 1000)
  }
};
