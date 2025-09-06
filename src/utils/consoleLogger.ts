// Utility to replace direct console logging with proper logger
import { logger } from '@/utils/logger';

// Helper function to replace console.error calls
export const logError = (message: string, error?: Error | unknown, context?: Record<string, unknown>) => {
  if (error instanceof Error) {
    logger.error(message, error, context);
  } else {
    logger.error(message, new Error(String(error)), context);
  }
};

// Helper function to replace console.warn calls
export const logWarn = (message: string, context?: Record<string, unknown>) => {
  logger.warn(message, context);
};

// Helper function to replace console.log calls in production
export const logInfo = (message: string, context?: Record<string, unknown>) => {
  logger.info(message, context);
};

// Helper function for debug logging
export const logDebug = (message: string, context?: Record<string, unknown>) => {
  logger.debug(message, context);
};