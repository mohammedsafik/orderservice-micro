const config = require('../config/env');
const kafka = require('../config/kafka');
const { handleInventoryEvent } = require('../services/orderService');
const logger = require('../utils/logger');

const consumer = kafka.consumer({
  groupId: config.kafka.consumerGroupId
});

let isConnected = false;
let isRunning = false;
let connectPromise = null;

async function connectConsumer() {
  if (isConnected) {
    return consumer;
  }

  if (!connectPromise) {
    connectPromise = consumer
      .connect()
      .then(async () => {
        isConnected = true;
        logger.info('Kafka consumer connected', {
          brokers: config.kafka.brokers,
          groupId: config.kafka.consumerGroupId
        });

        await consumer.subscribe({
          topic: config.kafka.inventoryEventsTopic,
          fromBeginning: false
        });

        logger.info('Kafka consumer subscribed', {
          topic: config.kafka.inventoryEventsTopic
        });

        return consumer;
      })
      .catch((error) => {
        connectPromise = null;
        logger.error('Kafka consumer connection failed', { error });
        throw error;
      });
  }

  return connectPromise;
}

async function startConsumer() {
  if (isRunning) {
    return consumer;
  }

  await connectConsumer();

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const rawValue = message.value ? message.value.toString() : '';
      const key = message.key ? message.key.toString() : null;

      try {
        const payload = JSON.parse(rawValue);

        logger.info('Inventory event consumed', {
          topic,
          partition,
          key,
          event: payload.event,
          orderId: payload.orderId
        });

        await handleInventoryEvent(payload);
      } catch (error) {
        logger.error('Failed to process inventory event', {
          topic,
          partition,
          key,
          rawValue,
          error
        });
      }
    }
  });

  isRunning = true;

  logger.info('Kafka consumer running', {
    topic: config.kafka.inventoryEventsTopic
  });

  return consumer;
}

async function disconnectConsumer() {
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

  if (isRunning) {
    await consumer.stop();
    isRunning = false;
    logger.info('Kafka consumer stopped');
  }

  await consumer.disconnect();
  isConnected = false;
  connectPromise = null;

  logger.info('Kafka consumer disconnected');
}

module.exports = {
  connectConsumer,
  disconnectConsumer,
  startConsumer
};
