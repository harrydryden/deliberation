// Centralized logging utility with environment-aware behavior
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

class Logger {
  private level: LogLevel;
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
    this.level = this.isDevelopment ? LogLevel.DEBUG : LogLevel.WARN;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatMessage(level: string, message: string, context?: any): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] ${level}:`;
    return context ? `${prefix} ${message} ${JSON.stringify(context)}` : `${prefix} ${message}`;
  }

  debug(message: string | any, context?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      if (typeof message === 'object') {
        console.log(this.formatMessage('DEBUG', 'Debug info', message));
      } else {
        console.log(this.formatMessage('DEBUG', message, context));
      }
    }
  }

  info(message: string | any, context?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      if (typeof message === 'object') {
        console.info(this.formatMessage('INFO', 'Info', message));
      } else {
        console.info(this.formatMessage('INFO', message, context));
      }
    }
  }

  warn(message: string | any, context?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      if (typeof message === 'object') {
        console.warn(this.formatMessage('WARN', 'Warning', message));
      } else {
        console.warn(this.formatMessage('WARN', message, context));
      }
    }
  }

  error(message: string | any, error?: Error | any, context?: any): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      if (typeof message === 'object') {
        console.error(this.formatMessage('ERROR', 'Error occurred', message));
      } else {
        const errorInfo = error instanceof Error ? { message: error.message, stack: error.stack } : error;
        console.error(this.formatMessage('ERROR', message, { error: errorInfo, ...context }));
      }
    }
  }

  // Auth-specific logging with consistent emojis
  auth = {
    start: (message: string, context?: any) => this.debug(`🚀 ${message}`, context),
    success: (message: string, context?: any) => this.info(`✅ ${message}`, context),
    failure: (message: string, error?: any, context?: any) => this.error(`❌ ${message}`, error, context),
    info: (message: string, context?: any) => this.debug(`🔍 ${message}`, context),
    progress: (message: string, context?: any) => this.debug(`🔄 ${message}`, context),
    complete: (message: string, context?: any) => this.debug(`🎯 ${message}`, context),
    blocked: (message: string, context?: any) => this.warn(`🚫 ${message}`, context),
    warning: (message: string, context?: any) => this.warn(`⚠️ ${message}`, context),
    timeout: (message: string, context?: any) => this.error(`⏰ ${message}`, null, context),
  };

  // API-specific logging
  api = {
    request: (method: string, url: string, context?: any) => this.debug(`🌐 ${method} ${url}`, context),
    response: (method: string, url: string, status: number, context?: any) => 
      this.debug(`📨 ${method} ${url} - ${status}`, context),
    error: (method: string, url: string, error: any, context?: any) => 
      this.error(`🚨 ${method} ${url} failed`, error, context),
  };

  // Component lifecycle logging
  component = {
    mount: (name: string, context?: any) => this.debug(`🔧 ${name} mounted`, context),
    unmount: (name: string, context?: any) => this.debug(`🔽 ${name} unmounted`, context),
    update: (name: string, context?: any) => this.debug(`🔄 ${name} updated`, context),
    error: (name: string, error: any, context?: any) => this.error(`💥 ${name} error`, error, context),
  };

  // Performance logging
  performance = {
    start: (operation: string) => {
      if (this.isDevelopment) {
        console.time(`⚡ ${operation}`);
      }
    },
    end: (operation: string) => {
      if (this.isDevelopment) {
        console.timeEnd(`⚡ ${operation}`);
      }
    },
    mark: (operation: string, context?: any) => this.debug(`📊 ${operation}`, context),
  };
}

export const logger = new Logger();

// Legacy console replacement for gradual migration
export const createLegacyLogger = (context: string) => ({
  log: (message: string, data?: any) => logger.info(`[${context}] ${message}`, data),
  warn: (message: string, data?: any) => logger.warn(`[${context}] ${message}`, data),
  error: (message: string, error?: any, data?: any) => logger.error(`[${context}] ${message}`, error, data),
});