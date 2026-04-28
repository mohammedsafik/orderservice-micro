function validateOrderPayload(payload) {
  const errors = [];

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return ['Request body must be a JSON object'];
  }

  if (typeof payload.userId !== 'string' || !payload.userId.trim()) {
    errors.push('userId is required and must be a non-empty string');
  }

  if (
    payload.customerEmail !== undefined &&
    (typeof payload.customerEmail !== 'string' || !payload.customerEmail.trim())
  ) {
    errors.push('customerEmail must be a non-empty string when provided');
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    errors.push('items is required and must be a non-empty array');
    return errors;
  }

  payload.items.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`items[${index}] must be an object`);
      return;
    }

    if (typeof item.productId !== 'string' || !item.productId.trim()) {
      errors.push(
        `items[${index}].productId is required and must be a non-empty string`
      );
    }

    if (!Number.isInteger(item.qty) || item.qty <= 0) {
      errors.push(`items[${index}].qty must be a positive integer`);
    }
  });

  return errors;
}

module.exports = validateOrderPayload;
