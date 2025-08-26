// Utility to replace console statements with proper logging
import { logger } from './logger';

// Override console methods to use logger in production
export const setupConsoleReplacement = () => {
  if (import.meta.env.PROD) {
    // Preserve original console for debugging
    const originalConsole = { ...console };
    
    console.log = (...args) => logger.info(args.join(' '));
    console.warn = (...args) => logger.warn(args.join(' '));
    console.error = (...args) => logger.error(args.join(' '), new Error('Console error'));
    console.info = (...args) => logger.info(args.join(' '));
    
    // Keep debug available for development
    console.debug = originalConsole.debug;
    
    // Store original for potential restoration
    (window as any).__originalConsole = originalConsole;
  }
};

// Helper for gradual migration - use this instead of console
export const devLog = {
  log: (...args: any[]) => {
    if (import.meta.env.DEV) {
      console.log(...args);
    } else {
      logger.info(args.join(' '));
    }
  },
  warn: (...args: any[]) => {
    if (import.meta.env.DEV) {
      console.warn(...args);
    } else {
      logger.warn(args.join(' '));
    }
  },
  error: (...args: any[]) => {
    if (import.meta.env.DEV) {
      console.error(...args);
    } else {
      logger.error(args.join(' '), new Error('Dev error'));
    }
  }
};
