// Structured logging utility

class Logger {
  constructor(module = 'APP') {
    this.module = module;
  }

  _formatMessage(level, message, data = null) {
    const logData = data ? ` | ${JSON.stringify(data)}` : '';
    return `${message}${logData}`;
  }

  info(message, data = null) {
    console.log(this._formatMessage('INFO', message, data));
  }

  warn(message, data = null) {
    console.warn(this._formatMessage('WARN', message, data));
  }

  error(message, error = null) {
    const errorData = error ? {
      message: error.message,
      stack: error.stack,
      ...(error.response && { response: error.response.data })
    } : null;
    console.error(this._formatMessage('ERROR', message, errorData));
  }

  debug(message, data = null) {
    if (process.env.NODE_ENV === 'development') {
      console.log(this._formatMessage('DEBUG', message, data));
    }
  }

  success(message, data = null) {
    console.log(this._formatMessage('SUCCESS', `✅ ${message}`, data));
  }

  progress(message, data = null) {
    console.log(this._formatMessage('PROGRESS', `${message}`, data));
  }
}

// Create module-specific loggers
const createLogger = (module) => new Logger(module);

module.exports = {
  Logger,
  createLogger,
  // Pre-configured loggers for common modules
  scraperLogger: createLogger('SCRAPER'),
  serverLogger: createLogger('SERVER'),
  llmLogger: createLogger('LLM'),
  calendarLogger: createLogger('CALENDAR')
};