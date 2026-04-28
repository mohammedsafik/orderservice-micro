const AppError = require('./AppError');
const logger = require('./logger');

function notFoundHandler(req, res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

function errorHandler(error, req, res, next) {
  let normalizedError = error;

  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    normalizedError = new AppError('Invalid JSON payload', 400);
  } else if (error.name === 'CastError') {
    normalizedError = new AppError('Invalid resource identifier', 400);
  } else if (error.name === 'ValidationError') {
    normalizedError = new AppError(
      'Validation failed',
      400,
      Object.values(error.errors).map((entry) => entry.message)
    );
  }

  const statusCode = normalizedError.statusCode || 500;
  const response = {
    success: false,
    message:
      statusCode >= 500 ? 'Internal server error' : normalizedError.message
  };

  if (normalizedError.details) {
    response.details = normalizedError.details;
  }

  if (process.env.NODE_ENV !== 'production' && statusCode >= 500) {
    response.stack = normalizedError.stack;
  }

  logger.error(normalizedError.message || 'Unhandled server error', {
    method: req.method,
    path: req.originalUrl,
    statusCode,
    error: normalizedError
  });

  res.status(statusCode).json(response);
}

module.exports = {
  errorHandler,
  notFoundHandler
};
