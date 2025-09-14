/**
 * Production Logger - Silent in production, informative in development
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

class Logger {
  private level: LogLevel;
  private isProduction: boolean;

  constructor() {
    this.isProduction = import.meta.env.MODE === 'production';
    this.level = this.isProduction ? LogLevel.ERROR : LogLevel.INFO;
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.level;
  }

  private formatMessage(level: string, message: string, context?: any): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] ${level}:`;
    return context ? `${prefix} ${message} ${JSON.stringify(context)}` : `${prefix} ${message}`;
  }

  debug(message: string | any, context?: any): void {
    if (this.isProduction) return;
    if (this.shouldLog(LogLevel.DEBUG)) {
      if (typeof message === 'object') {
        console.log(this.formatMessage('DEBUG', 'Debug info', message));
      } else {
        console.log(this.formatMessage('DEBUG', message, context));
      }
    }
  }

  info(message: string, context?: any): void {
    if (this.isProduction) return;
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage('INFO', message, context));
    }
  }

  warn(message: string, context?: any): void {
    if (this.isProduction) return;
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', message, context));
    }
  }

  error(message: string | any, error?: Error | any, context?: any): void {
    if (this.isProduction) return;
    if (this.shouldLog(LogLevel.ERROR)) {
      if (typeof message === 'object') {
        console.error(this.formatMessage('ERROR', 'Error occurred', message));
      } else {
        const errorInfo = error instanceof Error ? { message: error.message, stack: error.stack } : error;
        console.error(this.formatMessage('ERROR', message, { error: errorInfo, ...context }));
      }
    }
  }

  // Development-only logging methods (silent in production)
  auth = {
    start: (message: string, context?: any) => this.debug(`Auth start: ${message}`, context),
    success: (message: string, context?: any) => this.info(`Auth success: ${message}`, context),
    failure: (message: string, error?: any, context?: any) => this.error(`Auth failure: ${message}`, error, context),
    info: (message: string, context?: any) => this.debug(`Auth info: ${message}`, context),
    progress: (message: string, context?: any) => this.debug(`Auth progress: ${message}`, context),
    complete: (message: string, context?: any) => this.debug(`Auth complete: ${message}`, context),
    blocked: (message: string, context?: any) => this.warn(`Auth blocked: ${message}`, context),
    warning: (message: string, context?: any) => this.warn(`Auth warning: ${message}`, context),
    timeout: (message: string, context?: any) => this.error(`Auth timeout: ${message}`, null, context),
  };

  api = {
    request: (method: string, url: string, context?: any) => this.debug(`API request: ${method} ${url}`, context),
    response: (method: string, url: string, status: number, context?: any) => 
      this.debug(`API response: ${method} ${url} - ${status}`, context),
    error: (method: string, url: string, error: any, context?: any) => 
      this.error(`API error: ${method} ${url} failed`, error, context),
  };

  component = {
    mount: (name: string, context?: any) => this.debug(`Component mounted: ${name}`, context),
    unmount: (name: string, context?: any) => this.debug(`Component unmounted: ${name}`, context),
    update: (name: string, context?: any) => this.debug(`Component updated: ${name}`, context),
    error: (name: string, error: any, context?: any) => this.error(`Component error: ${name}`, error, context),
  };

  performance = {
    mark: (operation: string, context?: any) => this.debug(`Performance mark: ${operation}`, context),
  };
}

export const logger = new Logger();

// Factory functions for contextual logging
export const createLogger = (context: string) => ({
  log: (message: string, data?: any) => logger.info(`[${context}] ${message}`, data),
  info: (message: string, data?: any) => logger.info(`[${context}] ${message}`, data),
  debug: (message: string, data?: any) => logger.debug(`[${context}] ${message}`, data),
  warn: (message: string, data?: any) => logger.warn(`[${context}] ${message}`, data),
  error: (message: string, error?: any, data?: any) => logger.error(`[${context}] ${message}`, error, data),
});