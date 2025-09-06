// Production-safe logging utility that completely removes debug output
// This replaces all console.log, console.debug calls with no-ops in production

const isProduction = process.env.NODE_ENV === 'production';

// Production-safe logger that completely disables all debug output
export const productionLogger = {
  // Critical errors only - these should be logged even in production
  error: (message: string, error?: any) => {
    console.error(`[ERROR] ${message}`, error);
  },
  
  // Warnings only for critical issues
  warn: (message: string, context?: any) => {
    if (!isProduction) {
      console.warn(`[WARN] ${message}`, context);
    }
  },
  
  // Info completely disabled in production
  info: (message: string, context?: any) => {
    if (!isProduction) {
      console.info(`[INFO] ${message}`, context);
    }
  },
  
  // Debug completely disabled in production
  debug: (message: string, context?: any) => {
    if (!isProduction) {
      console.log(`[DEBUG] ${message}`, context);
    }
  },
  
  // Performance logging disabled in production
  performance: {
    start: (operation: string) => {
      if (!isProduction) {
        console.time(operation);
      }
    },
    end: (operation: string) => {
      if (!isProduction) {
        console.timeEnd(operation);
      }
    }
  }
};

// Helper to create component-specific logger
export const createComponentLogger = (componentName: string) => ({
  error: (message: string, error?: any) => productionLogger.error(`[${componentName}] ${message}`, error),
  warn: (message: string, context?: any) => productionLogger.warn(`[${componentName}] ${message}`, context),
  info: (message: string, context?: any) => productionLogger.info(`[${componentName}] ${message}`, context),
  debug: (message: string, context?: any) => productionLogger.debug(`[${componentName}] ${message}`, context),
});