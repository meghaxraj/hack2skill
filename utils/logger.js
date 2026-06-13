/**
 * Logging & Monitoring Service
 * Improves code quality through comprehensive observability
 * Enables debugging, performance monitoring, and error tracking
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../logs');

class Logger {
  constructor() {
    this.ensureLogDir();
  }

  ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  }

  /**
   * Format log message with timestamp and level
   */
  formatMessage(level, context, message, data = null) {
    const timestamp = new Date().toISOString();
    const baseMsg = `[${timestamp}] [${level}] [${context}]`;
    return data ? `${baseMsg} ${message} ${JSON.stringify(data)}` : `${baseMsg} ${message}`;
  }

  /**
   * Write log to file and console
   */
  writeLog(level, context, message, data = null) {
    const formatted = this.formatMessage(level, context, message, data);
    const filename = path.join(LOG_DIR, `${level.toLowerCase()}-${new Date().toISOString().split('T')[0]}.log`);

    // Console output for development
    const consoleMethod = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log';
    console[consoleMethod](formatted);

    // File output for production
    fs.appendFile(filename, formatted + '\n', (err) => {
      if (err) console.error('Failed to write log:', err);
    });
  }

  info(context, message, data = null) {
    this.writeLog('INFO', context, message, data);
  }

  error(context, message, data = null) {
    this.writeLog('ERROR', context, message, data);
  }

  warn(context, message, data = null) {
    this.writeLog('WARN', context, message, data);
  }

  debug(context, message, data = null) {
    if (process.env.DEBUG) {
      this.writeLog('DEBUG', context, message, data);
    }
  }

  /**
   * Performance monitoring
   */
  startTimer(operationName) {
    return {
      operationName,
      startTime: Date.now(),
      end: () => {
        const duration = Date.now() - this.startTime;
        this.info('PERF', `${operationName} completed`, { duration_ms: duration });
        return duration;
      }
    };
  }
}

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      api_calls: {},
      db_operations: {},
      analysis_time: []
    };
  }

  /**
   * Track API endpoint performance
   */
  trackAPICall(endpoint, method, duration, statusCode) {
    const key = `${method} ${endpoint}`;
    if (!this.metrics.api_calls[key]) {
      this.metrics.api_calls[key] = {
        count: 0,
        totalTime: 0,
        avgTime: 0,
        maxTime: 0,
        minTime: Infinity,
        statusCodes: {}
      };
    }

    const stat = this.metrics.api_calls[key];
    stat.count++;
    stat.totalTime += duration;
    stat.avgTime = stat.totalTime / stat.count;
    stat.maxTime = Math.max(stat.maxTime, duration);
    stat.minTime = Math.min(stat.minTime, duration);
    stat.statusCodes[statusCode] = (stat.statusCodes[statusCode] || 0) + 1;
  }

  /**
   * Track database operation performance
   */
  trackDBOperation(operationType, duration) {
    if (!this.metrics.db_operations[operationType]) {
      this.metrics.db_operations[operationType] = {
        count: 0,
        totalTime: 0,
        avgTime: 0
      };
    }

    const stat = this.metrics.db_operations[operationType];
    stat.count++;
    stat.totalTime += duration;
    stat.avgTime = stat.totalTime / stat.count;
  }

  /**
   * Track analysis operation time
   */
  trackAnalysisTime(duration) {
    this.metrics.analysis_time.push(duration);
  }

  /**
   * Get performance summary
   */
  getSummary() {
    const avgAnalysis = this.metrics.analysis_time.length > 0
      ? (this.metrics.analysis_time.reduce((a, b) => a + b) / this.metrics.analysis_time.length).toFixed(2)
      : 0;

    return {
      api_calls: this.metrics.api_calls,
      db_operations: this.metrics.db_operations,
      avg_analysis_ms: avgAnalysis,
      analysis_count: this.metrics.analysis_time.length
    };
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics = {
      api_calls: {},
      db_operations: {},
      analysis_time: []
    };
  }
}

module.exports = {
  Logger,
  PerformanceMonitor
};
