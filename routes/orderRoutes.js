const express = require('express');

const {
  createOrderHandler,
  getOrderByIdHandler
} = require('../controllers/orderController');

const router = express.Router();

router.post('/', createOrderHandler);
router.get('/:id', getOrderByIdHandler);

module.exports = router;
