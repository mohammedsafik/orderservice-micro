const mongoose = require('mongoose');

const Order = require('../models/Order');
const { publishOrderCreatedEvent } = require('../kafka/producer');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

function normalizeItems(items) {
  return items.map((item) => ({
    productId: item.productId.trim(),
    qty: item.qty
  }));
}

async function rollbackOrder(orderId) {
  try {
    await Order.findByIdAndDelete(orderId);
    logger.warn('Order rolled back after Kafka publish failure', { orderId });
  } catch (error) {
    logger.error('Order rollback failed after Kafka publish failure', {
      orderId,
      error
    });
  }
}

async function createOrder(payload) {
  const order = await Order.create({
    userId: payload.userId.trim(),
    customerEmail:
      typeof payload.customerEmail === 'string' && payload.customerEmail.trim()
        ? payload.customerEmail.trim().toLowerCase()
        : undefined,
    items: normalizeItems(payload.items),
    status: 'PENDING'
  });

  logger.info('Order created', {
    orderId: order.id,
    userId: order.userId,
    itemCount: order.items.length,
    status: order.status
  });

  try {
    await publishOrderCreatedEvent(order);
    return order;
  } catch (error) {
    logger.error('Kafka publish failed for created order', {
      orderId: order.id,
      error
    });

    await rollbackOrder(order._id);

    throw new AppError(
      'Order creation failed because the order event could not be published',
      503
    );
  }
}

async function getOrderById(orderId) {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new AppError('Invalid order id', 400);
  }

  const order = await Order.findById(orderId).lean();

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  return order;
}

async function handleInventoryEvent(payload) {
  if (!payload || typeof payload !== 'object') {
    logger.warn('Ignoring inventory event with invalid payload', { payload });
    return null;
  }

  const { event, orderId } = payload;

  if (!event || !orderId) {
    logger.warn('Ignoring inventory event with missing fields', { payload });
    return null;
  }

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    logger.warn('Ignoring inventory event with invalid order id', {
      event,
      orderId
    });
    return null;
  }

  const targetStatusByEvent = {
    INVENTORY_RESERVED: 'CONFIRMED',
    OUT_OF_STOCK: 'CANCELLED'
  };

  const targetStatus = targetStatusByEvent[event];

  if (!targetStatus) {
    logger.warn('Ignoring unsupported inventory event', { event, orderId });
    return null;
  }

  const order = await Order.findById(orderId);

  if (!order) {
    logger.warn('Order not found for inventory event', { event, orderId });
    return null;
  }

  if (order.status === targetStatus) {
    logger.info('Inventory event already applied to order', {
      orderId,
      event,
      status: order.status
    });
    return order;
  }

  if (order.status !== 'PENDING') {
    logger.warn('Ignoring inventory event for non-pending order', {
      orderId,
      event,
      currentStatus: order.status,
      targetStatus
    });
    return order;
  }

  order.status = targetStatus;
  await order.save();

  logger.info('Order updated from inventory event', {
    orderId,
    event,
    status: order.status
  });

  return order;
}

module.exports = {
  createOrder,
  getOrderById,
  handleInventoryEvent
};
