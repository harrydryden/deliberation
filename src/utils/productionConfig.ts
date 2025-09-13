/**
 * Production Configuration
 */

export const productionConfig = {
  isProduction: process.env.NODE_ENV === 'production',
  enableLogging: process.env.NODE_ENV !== 'production',
  cacheTimeout: 5 * 60 * 1000, // 5 minutes
  retryAttempts: 3,
};

export const isProduction = productionConfig.isProduction;