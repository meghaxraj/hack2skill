/**
 * Security Middleware - Rate Limiting, Validation, CORS Protection
 * Enhances API security and prevents common attacks
 */

const rateLimit = require('express-rate-limit');

// Global rate limiter: 100 requests per 15 minutes
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health'
});

// Strict rate limiter for auth/profile endpoints: 20 requests per 15 minutes
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many profile update attempts, please wait before trying again.',
  standardHeaders: true,
  legacyHeaders: false
});

// API analysis endpoints: 30 requests per 15 minutes (more generous for heavy compute)
const analysisLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Analysis request limit exceeded, please wait before submitting another journal.',
  standardHeaders: true,
  legacyHeaders: false
});

// Input validation helpers
function validateUsername(username) {
  if (typeof username !== 'string') return false;
  const cleaned = username.toLowerCase().trim();
  // Allow alphanumeric, underscore, hyphen; 3-32 chars
  return /^[a-z0-9_-]{3,32}$/.test(cleaned);
}

function validateEmail(email) {
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 100;
}

function validateDate(dateString) {
  if (typeof dateString !== 'string' || dateString === '') return true; // optional
  const date = new Date(dateString);
  return !isNaN(date.getTime()) && date > new Date(); // future date
}

function validateSleepGoal(hours) {
  const num = parseFloat(hours);
  return !isNaN(num) && num >= 4 && num <= 12; // realistic sleep range
}

// Sanitize text input (prevent XSS)
function sanitizeInput(text, maxLength = 5000) {
  if (typeof text !== 'string') return '';
  
  let sanitized = text
    .substring(0, maxLength)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  
  return sanitized;
}

// Middleware: Validate user ID format
function validateUserIdMiddleware(req, res, next) {
  const userId = req.get('X-User-Id') || 'student';
  
  if (!validateUsername(userId)) {
    return res.status(400).json({ 
      error: 'Invalid user ID format. Use 3-32 alphanumeric characters.' 
    });
  }
  
  req.userId = userId.toLowerCase().trim();
  next();
}

// Middleware: Request body size limit
function requestSizeMiddleware() {
  return (req, res, next) => {
    const contentLength = parseInt(req.get('content-length') || '0', 10);
    if (contentLength > 50000) { // 50KB max
      return res.status(413).json({ error: 'Request body too large' });
    }
    next();
  };
}

// Middleware: Enhanced security headers
function securityHeadersMiddleware(req, res, next) {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

module.exports = {
  globalLimiter,
  strictLimiter,
  analysisLimiter,
  validateUsername,
  validateEmail,
  validateDate,
  validateSleepGoal,
  sanitizeInput,
  validateUserIdMiddleware,
  requestSizeMiddleware,
  securityHeadersMiddleware
};
