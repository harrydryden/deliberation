// Edge function performance optimization utilities
import { isProduction } from './productionConfig';

// Production-safe logging for edge functions
export const edgeLogger = {
  info: (message: string, data?: any) => {
    if (!isProduction) {
      console.log(`[INFO] ${message}`, data);
    }
  },
  
  debug: (message: string, data?: any) => {
    if (!isProduction) {
      console.log(`[DEBUG] ${message}`, data);
    }
  },
  
  error: (message: string, error?: any) => {
    // Always log errors
    console.error(`[ERROR] ${message}`, error);
  },
  
  warn: (message: string, data?: any) => {
    if (!isProduction) {
      console.warn(`[WARN] ${message}`, data);
    }
  }
};

// Performance timing utility
export const createPerformanceTimer = (operation: string) => {
  const start = Date.now();
  
  return {
    end: () => {
      const duration = Date.now() - start;
      if (!isProduction && duration > 1000) {
        console.warn(`Slow operation: ${operation} took ${duration}ms`);
      }
      return duration;
    }
  };
};

// Memory-efficient response builder
export const buildOptimizedResponse = (data: any, status: number = 200) => {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': isProduction ? 'public, max-age=300' : 'no-cache',
      },
    }
  );
};