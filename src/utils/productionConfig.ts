// Production configuration settings
export const PRODUCTION_CONFIG = {
  // Memory monitoring
  MEMORY_THRESHOLD_MB: 150,
  MEMORY_CHECK_INTERVAL_MS: 30000,
  
  // Logging
  ENABLE_DEBUG_LOGS: false,
  ENABLE_INFO_LOGS: false,
  ENABLE_PERFORMANCE_MONITORING: false,
  
  // Cache settings
  API_CACHE_TTL_MS: 60000, // 1 minute
  ADMIN_CACHE_TTL_MS: 30000, // 30 seconds
  
  // Performance
  MAX_CONCURRENT_STREAMS: 1,
  STREAM_TIMEOUT_MS: 30000,
} as const;

// Check if we're in production
export const isProduction = process.env.NODE_ENV === 'production';

// Get config value with environment override
export const getConfigValue = <T>(key: keyof typeof PRODUCTION_CONFIG, fallback: T): T => {
  if (isProduction) {
    return PRODUCTION_CONFIG[key] as T;
  }
  return fallback;
};