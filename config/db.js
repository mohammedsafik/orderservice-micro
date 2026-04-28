const mongoose = require('mongoose');

const config = require('./env');
const logger = require('../utils/logger');

mongoose.connection.on('error', (error) => {
  logger.error('MongoDB runtime error', { error });
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

async function connectDB() {
  try {
    await mongoose.connect(config.mongoUri, {
      autoIndex: config.nodeEnv !== 'production',
      serverSelectionTimeoutMS: 5000
    });

    logger.info('MongoDB connected', {
      host: mongoose.connection.host,
      database: mongoose.connection.name
    });
  } catch (error) {
    logger.error('MongoDB connection failed', { error });
    throw error;
  }
}

module.exports = connectDB;
