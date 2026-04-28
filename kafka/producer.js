const kafka = require('../config/kafka');
const config = require('../config/env');
const logger = require('../utils/logger');

const producer = kafka.producer();

let isConnected = false;
let connectPromise = null;

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function connectProducer() {
  if (isConnected) {
    return producer;
  }

  if (!connectPromise) {
    connectPromise = producer
      .connect()
      .then(() => {
        isConnected = true;
        logger.info('Kafka producer connected', {
          brokers: config.kafka.brokers
        });
        return producer;
      })
      .catch((error) => {
        connectPromise = null;
        logger.error('Kafka producer connection failed', { error });
        throw error;
      });
  }

  return connectPromise;
}

async function sendMessageWithRetry(topic, messages) {
  await connectProducer();

  let lastError;

  for (let attempt = 1; attempt <= config.kafka.retryAttempts; attempt += 1) {
    try {
      return await producer.send({
        topic,
        messages,
        acks: -1
      });
    } catch (error) {
      lastError = error;

      logger.warn('Kafka send attempt failed', {
        topic,
        attempt,
        maxAttempts: config.kafka.retryAttempts,
        error
      });

      if (attempt < config.kafka.retryAttempts) {
        await delay(config.kafka.retryDelayMs * attempt);
      }
    }
  }

  throw lastError;
}

async function publishOrderCreatedEvent(order) {
  const payload = {
    event: 'ORDER_CREATED',
    orderId: order.id,
    userId: order.userId,
    items: order.items.map((item) => ({
      productId: item.productId,
      qty: item.qty
    }))
  };

  await sendMessageWithRetry(config.kafka.orderEventsTopic, [
    {
      key: order.id,
      value: JSON.stringify(payload)
    }
  ]);

  logger.info('Order event published', {
    topic: config.kafka.orderEventsTopic,
    event: payload.event,
    orderId: payload.orderId
  });

  return payload;
}

async function disconnectProducer() {
  if (connectPromise) {
    try {
      await connectPromise;
    } catch (error) {
      return;
    }
  }

  if (!isConnected) {
    return;
  }

  await producer.disconnect();
  isConnected = false;
  connectPromise = null;

  logger.info('Kafka producer disconnected');
}

module.exports = {
  connectProducer,
  disconnectProducer,
  publishOrderCreatedEvent
};
