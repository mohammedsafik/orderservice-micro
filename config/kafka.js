const { Kafka, logLevel } = require('kafkajs');

const config = require('./env');

module.exports = new Kafka({
  clientId: config.kafka.clientId,
  brokers: config.kafka.brokers,
  logLevel: logLevel.NOTHING
});
