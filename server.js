const mongoose = require('mongoose');

const app = require('./app');
const config = require('./config/env');
const connectDB = require('./config/db');
const { disconnectConsumer, startConsumer } = require('./kafka/consumer');
const { connectProducer, disconnectProducer } = require('./kafka/producer');
const logger = require('./utils/logger');

let server;
let isShuttingDown = false;

function startHttpServer() {
  return new Promise((resolve, reject) => {
    const httpServer = app.listen(config.port);

    const handleListening = () => {
      httpServer.off('error', handleError);
      logger.info('Order Service started', {
        port: config.port,
        environment: config.nodeEnv
      });
      resolve(httpServer);
    };

    const handleError = (error) => {
      httpServer.off('listening', handleListening);
      reject(error);
    };

    httpServer.once('listening', handleListening);
    httpServer.once('error', handleError);
  });
}

function stopHttpServer() {
  if (!server || !server.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      logger.info('HTTP server closed');
      server = null;
      resolve();
    });
  });
}

async function startServer() {
  try {
    await connectDB();
    await connectProducer();
    await startConsumer();
    server = await startHttpServer();
  } catch (error) {
    logger.error('Application startup failed', { error });
    await shutdown(1);
  }
}

async function shutdown(exitCode) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info('Shutdown initiated');

  try {
    await stopHttpServer();
    await disconnectConsumer();
    await disconnectProducer();

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      logger.info('MongoDB disconnected');
    }

    process.exit(exitCode);
  } catch (error) {
    logger.error('Shutdown failed', { error });
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('unhandledRejection', (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  logger.error('Unhandled promise rejection', { error });
  shutdown(1);
});
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  shutdown(1);
});

startServer();
