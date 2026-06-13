/**
 * Application Configuration
 * Improves code quality through centralized configuration management
 * Makes the application more maintainable and environment-aware
 */

require('dotenv').config();

const config = {
  // Server Configuration
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    env: process.env.NODE_ENV || 'development',
    isDevelopment: (process.env.NODE_ENV || 'development') === 'development',
    isProduction: process.env.NODE_ENV === 'production'
  },

  // API Configuration
  api: {
    maxRequestSize: '10mb',
    maxBodySize: 50000, // bytes
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // requests per window
      profile: {
        max: 20
      },
      analysis: {
        max: 30
      }
    }
  },

  // Database Configuration
  database: {
    path: process.env.DB_PATH || './db.json',
    cacheEnabled: process.env.CACHE_ENABLED !== 'false',
    cacheTTL: parseInt(process.env.CACHE_TTL || '300000', 10), // 5 minutes
    asyncIOEnabled: process.env.ASYNC_IO_ENABLED !== 'false'
  },

  // AI/Gemini Configuration
  ai: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.AI_MODEL || 'gemini-2.5-flash',
    enabled: !!process.env.GEMINI_API_KEY,
    timeout: parseInt(process.env.AI_TIMEOUT || '30000', 10) // 30 seconds
  },

  // Logging Configuration
  logging: {
    enabled: process.env.LOGGING_ENABLED !== 'false',
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || './logs'
  },

  // Performance Monitoring
  monitoring: {
    enabled: process.env.MONITORING_ENABLED !== 'false',
    slowQueryThreshold: parseInt(process.env.SLOW_QUERY_THRESHOLD || '100', 10), // ms
    slowAPIThreshold: parseInt(process.env.SLOW_API_THRESHOLD || '500', 10) // ms
  },

  // Security Configuration
  security: {
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['*'],
    trustProxy: process.env.TRUST_PROXY === 'true',
    helmetEnabled: process.env.HELMET_ENABLED !== 'false',
    rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    sanitizationEnabled: process.env.SANITIZATION_ENABLED !== 'false'
  },

  // Feature Flags
  features: {
    advancedAnalysis: process.env.FEATURE_ADVANCED_ANALYSIS !== 'false',
    trendAnalysis: process.env.FEATURE_TREND_ANALYSIS !== 'false',
    personalizedRecommendations: process.env.FEATURE_PERSONALIZED_RECS !== 'false',
    sleepTracking: process.env.FEATURE_SLEEP_TRACKING !== 'false',
    anxietyAnalysis: process.env.FEATURE_ANXIETY_ANALYSIS !== 'false'
  }
};

/**
 * Validate configuration
 */
function validateConfig() {
  const errors = [];

  if (!config.database.path) {
    errors.push('DATABASE_PATH is required');
  }

  if (config.server.isProduction && !config.ai.apiKey) {
    errors.push('GEMINI_API_KEY is required in production');
  }

  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }

  if (errors.length > 0) {
    console.error('Configuration validation errors:', errors);
    if (config.server.isProduction) {
      process.exit(1);
    }
  }
}

/**
 * Get configuration value with fallback
 */
function getConfig(path, defaultValue = null) {
  const keys = path.split('.');
  let current = config;

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return defaultValue;
    }
  }

  return current;
}

validateConfig();

module.exports = {
  config,
  getConfig
};
