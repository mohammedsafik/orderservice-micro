class AppError extends Error {
  constructor(message, statusCode, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode || 500;
    this.details = details;
    this.status = `${this.statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
