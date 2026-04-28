const path = require('path');
const grpc = require('@grpc/grpc-js');
const mongoose = require('mongoose');
const protoLoader = require('@grpc/proto-loader');

const connectDB = require('../config/db');
const config = require('../config/env');
const { getOrderById } = require('../services/orderService');
const logger = require('../utils/logger');

const PROTO_PATH = path.join(__dirname, 'order.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const orderProto = grpc.loadPackageDefinition(packageDefinition);

let grpcServer;
let grpcStartPromise;
let isStandaloneShuttingDown = false;

function createGrpcError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function mapErrorToGrpc(error) {
  if (error?.statusCode === 400) {
    return createGrpcError(grpc.status.INVALID_ARGUMENT, error.message);
  }

  if (error?.statusCode === 404) {
    return createGrpcError(grpc.status.NOT_FOUND, error.message);
  }

  if (
    error &&
    (error.name === 'MongooseError' ||
      error.name === 'MongoServerSelectionError' ||
      error.name === 'MongoNetworkError')
  ) {
    return createGrpcError(grpc.status.UNAVAILABLE, 'Database unavailable');
  }

  return createGrpcError(grpc.status.INTERNAL, 'Internal server error');
}

function getCustomerEmail(order) {
  const directCandidates = [
    order.customerEmail,
    order.email,
    order.userEmail,
    order.customer?.email,
    order.customer?.contact?.email,
    order.user?.email,
    order.contact?.email,
    order.profile?.email,
    order.shipping?.email,
    order.billing?.email
  ];

  const directMatch = directCandidates.find(
    (value) => typeof value === 'string' && value.trim()
  );

  if (directMatch) {
    return directMatch.trim();
  }

  const queue = [order];
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current || typeof current !== 'object' || visited.has(current)) {
      continue;
    }

    visited.add(current);

    for (const [key, value] of Object.entries(current)) {
      if (typeof value === 'string' && /email/i.test(key) && value.trim()) {
        return value.trim();
      }

      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return '';
}

function getValueByPath(source, pathExpression) {
  if (!source || typeof source !== 'object' || !pathExpression) {
    return undefined;
  }

  return pathExpression.split('.').reduce((value, key) => {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    return value[key];
  }, source);
}

function getMetadataValue(metadata, key) {
  if (!metadata || typeof metadata.get !== 'function') {
    return '';
  }

  const values = metadata.get(key);

  if (!Array.isArray(values) || values.length === 0) {
    return '';
  }

  const [firstValue] = values;

  return Buffer.isBuffer(firstValue)
    ? firstValue.toString('utf8')
    : String(firstValue);
}

function buildAuthServiceUrl(userId) {
  if (!config.auth.serviceUrl) {
    return '';
  }

  const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
  let requestPath = config.auth.userEmailPath;

  if (requestPath.includes('{userId}')) {
    requestPath = requestPath.replaceAll(
      '{userId}',
      encodeURIComponent(normalizedUserId)
    );
  }

  if (requestPath.includes('{orderUserId}')) {
    requestPath = requestPath.replaceAll(
      '{orderUserId}',
      encodeURIComponent(normalizedUserId)
    );
  }

  return new URL(requestPath, config.auth.serviceUrl).toString();
}

async function fetchCustomerEmailFromAuthService(userId, metadata) {
  const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';

  if (!config.auth.serviceUrl) {
    return '';
  }

  if (!normalizedUserId && config.auth.userEmailPath.includes('{userId}')) {
    return '';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, config.auth.timeoutMs);

  const headers = {
    accept: 'application/json'
  };

  const authorization =
    getMetadataValue(metadata, 'authorization') ||
    getMetadataValue(metadata, 'Authorization');

  if (authorization) {
    headers.authorization = authorization;
  }

  try {
    const response = await fetch(buildAuthServiceUrl(normalizedUserId), {
      method: 'GET',
      headers,
      signal: controller.signal
    });

    if (response.status === 401 || response.status === 403 || response.status === 404) {
      return '';
    }

    if (!response.ok) {
      throw new Error(`Auth service responded with status ${response.status}`);
    }

    const payload = await response.json();
    const email = getValueByPath(payload, config.auth.userEmailField);
    return typeof email === 'string' ? email.trim() : '';
  } finally {
    clearTimeout(timeout);
  }
}

function getCustomerEmailSource(orderEmail, authServiceEmail) {
  if (orderEmail) {
    return 'order-db';
  }

  if (authServiceEmail) {
    return 'auth-service';
  }

  return 'missing';
}

function normalizeItems(items = []) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item, index) => {
    const quantity = Number(item.quantity ?? item.qty ?? 1);

    return {
      sku: String(item.sku || item.productId || item.product?.sku || ''),
      name: String(
        item.name ||
          item.productName ||
          item.product?.name ||
          `Item ${index + 1}`
      ),
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1
    };
  });
}

async function getOrderByIdHandler(call, callback) {
  const orderId =
    typeof call.request.orderId === 'string' ? call.request.orderId.trim() : '';

  logger.info('gRPC request received', {
    method: 'GetOrderById',
    orderId
  });

  if (!orderId) {
    const grpcError = createGrpcError(
      grpc.status.INVALID_ARGUMENT,
      'Invalid order id'
    );

    callback(grpcError);
    return;
  }

  try {
    const order = await getOrderById(orderId);
    const orderEmail = getCustomerEmail(order);
    let customerEmail = orderEmail;
    let customerEmailSource = orderEmail ? 'order-db' : 'missing';

    if (!customerEmail) {
      try {
        customerEmail = await fetchCustomerEmailFromAuthService(
          String(order.userId || ''),
          call.metadata
        );
        customerEmailSource = getCustomerEmailSource(orderEmail, customerEmail);
      } catch (error) {
        customerEmailSource = 'auth-service-unavailable';
        logger.warn('Customer email lookup failed', {
          method: 'GetOrderById',
          orderId: String(order._id),
          userId: String(order.userId || ''),
          error
        });
      }
    }

    const response = {
      orderId: String(order._id),
      userId: String(order.userId || ''),
      status: String(order.status || ''),
      customerEmail: String(customerEmail),
      items: normalizeItems(order.items)
    };

    logger.info('gRPC response sent', {
      method: 'GetOrderById',
      orderId: response.orderId,
      userId: response.userId,
      status: response.status,
      customerEmail: response.customerEmail,
      customerEmailSource,
      itemsCount: response.items.length
    });

    callback(null, response);
  } catch (error) {
    const grpcError = mapErrorToGrpc(error);

    logger.error('gRPC request failed', {
      method: 'GetOrderById',
      orderId,
      code: grpcError.code,
      error
    });

    callback(grpcError);
  }
}

function startGrpcServer() {
  if (grpcServer) {
    return Promise.resolve(grpcServer);
  }

  if (grpcStartPromise) {
    return grpcStartPromise;
  }

  grpcServer = new grpc.Server();
  grpcServer.addService(orderProto.OrderService.service, {
    GetOrderById: getOrderByIdHandler
  });

  grpcStartPromise = new Promise((resolve, reject) => {
    grpcServer.bindAsync(
      `${config.grpc.host}:${config.grpc.port}`,
      grpc.ServerCredentials.createInsecure(),
      (error, port) => {
        if (error) {
          grpcStartPromise = null;
          grpcServer = null;
          reject(error);
          return;
        }

        grpcServer.start();
        grpcStartPromise = null;

        logger.info('gRPC server started', {
          host: config.grpc.host,
          port
        });

        resolve(grpcServer);
      }
    );
  });

  return grpcStartPromise;
}

async function stopGrpcServer() {
  if (grpcStartPromise) {
    try {
      await grpcStartPromise;
    } catch (error) {
      return;
    }
  }

  if (!grpcServer) {
    return;
  }

  await new Promise((resolve, reject) => {
    grpcServer.tryShutdown((error) => {
      if (error) {
        reject(error);
        return;
      }

      logger.info('gRPC server closed');
      grpcServer = null;
      resolve();
    });
  });
}

module.exports = {
  startGrpcServer,
  stopGrpcServer
};

if (require.main === module) {
  const startStandaloneServer = async () => {
    try {
      if (mongoose.connection.readyState === 0) {
        await connectDB();
      }

      await startGrpcServer();
    } catch (error) {
      logger.error('gRPC standalone startup failed', { error });
      await shutdown(1);
    }
  };

  const shutdown = async (exitCode) => {
    if (isStandaloneShuttingDown) {
      return;
    }

    isStandaloneShuttingDown = true;

    try {
      await stopGrpcServer();

      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
        logger.info('MongoDB disconnected');
      }

      process.exit(exitCode);
    } catch (error) {
      logger.error('gRPC standalone shutdown failed', { error });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  startStandaloneServer();
}
