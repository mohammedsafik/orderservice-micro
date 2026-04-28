const { createOrder, getOrderById } = require('../services/orderService');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const validateOrderPayload = require('../utils/validateOrderPayload');

const createOrderHandler = asyncHandler(async (req, res) => {
  const validationErrors = validateOrderPayload(req.body);

  if (validationErrors.length > 0) {
    throw new AppError('Validation failed', 400, validationErrors);
  }

  const order = await createOrder(req.body);

  res.status(201).json({
    success: true,
    data: order
  });
});

const getOrderByIdHandler = asyncHandler(async (req, res) => {
  const order = await getOrderById(req.params.id);

  res.status(200).json({
    success: true,
    data: order
  });
});

module.exports = {
  createOrderHandler,
  getOrderByIdHandler
};
