/**
 * Production Configuration
 */

export const productionConfig = {
  isProduction: import.meta.env.MODE === 'production',
  enableLogging: import.meta.env.MODE !== 'production',
  cacheTimeout: 5 * 60 * 1000, // 5 minutes
  retryAttempts: 3,
};

export const isProduction = productionConfig.isProduction;