/**
 * Consistent API Response Format
 * Improves code quality through standardized response patterns
 * Makes API responses predictable and easier to handle on the frontend
 */

/**
 * Standard API Response Format
 * @typedef {Object} APIResponse
 * @property {boolean} success - Whether request succeeded
 * @property {number} statusCode - HTTP status code
 * @property {*} data - Response data (null on error)
 * @property {string} message - Human-readable message
 * @property {Array<string>} errors - Array of error messages (if any)
 * @property {number} timestamp - Unix timestamp
 */

class APIResponseFormatter {
  /**
   * Success response (200-299)
   */
  static success(data, message = 'Success', statusCode = 200) {
    return {
      success: true,
      statusCode,
      data,
      message,
      errors: [],
      timestamp: Date.now()
    };
  }

  /**
   * Error response (4xx-5xx)
   */
  static error(message, errors = [], statusCode = 400, data = null) {
    return {
      success: false,
      statusCode,
      data,
      message,
      errors: Array.isArray(errors) ? errors : [errors],
      timestamp: Date.now()
    };
  }

  /**
   * Validation error (422)
   */
  static validationError(errors) {
    return this.error(
      'Validation failed',
      Array.isArray(errors) ? errors : [errors],
      422
    );
  }

  /**
   * Not found error (404)
   */
  static notFound(resource = 'Resource') {
    return this.error(`${resource} not found`, [], 404);
  }

  /**
   * Unauthorized error (401)
   */
  static unauthorized(message = 'Unauthorized') {
    return this.error(message, [], 401);
  }

  /**
   * Forbidden error (403)
   */
  static forbidden(message = 'Forbidden') {
    return this.error(message, [], 403);
  }

  /**
   * Server error (500)
   */
  static serverError(message = 'Internal server error', error = null) {
    const errors = error ? [error.message || String(error)] : [];
    return this.error(message, errors, 500);
  }

  /**
   * Rate limit error (429)
   */
  static rateLimitExceeded(message = 'Too many requests') {
    return this.error(message, [], 429);
  }

  /**
   * Created response (201)
   */
  static created(data, message = 'Created successfully') {
    return this.success(data, message, 201);
  }

  /**
   * No content response (204)
   */
  static noContent(message = 'No content') {
    return this.success(null, message, 204);
  }
}

/**
 * Error handling decorator for Express route handlers
 * Wraps route handlers to catch errors automatically
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      console.error('Unhandled error:', err);
      res.status(500).json(
        APIResponseFormatter.serverError('Internal server error', err)
      );
    });
  };
}

/**
 * Middleware to add response formatter to Express response object
 */
function responseFormatterMiddleware(req, res, next) {
  res.apiSuccess = (data, message, statusCode) => {
    const response = APIResponseFormatter.success(data, message, statusCode);
    res.status(response.statusCode).json(response);
  };

  res.apiError = (message, errors, statusCode) => {
    const response = APIResponseFormatter.error(message, errors, statusCode);
    res.status(response.statusCode).json(response);
  };

  res.apiValidationError = (errors) => {
    const response = APIResponseFormatter.validationError(errors);
    res.status(response.statusCode).json(response);
  };

  res.apiNotFound = (resource) => {
    const response = APIResponseFormatter.notFound(resource);
    res.status(response.statusCode).json(response);
  };

  res.apiServerError = (message, error) => {
    const response = APIResponseFormatter.serverError(message, error);
    res.status(response.statusCode).json(response);
  };

  next();
}

module.exports = {
  APIResponseFormatter,
  asyncHandler,
  responseFormatterMiddleware
};
