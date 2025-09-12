// Environment configuration utilities for self-hosting compatibility
import { productionLogger } from './productionLogger';

export const isProduction = () => {
  return import.meta.env.NODE_ENV === 'production' || 
         (typeof process !== 'undefined' && process.env.NODE_ENV === 'production');
};

export const isDevelopment = () => {
  return !isProduction();
};

// Get environment variable with multiple fallback sources
export const getEnvVar = (viteKey: string, processKey?: string, fallback?: string): string => {
  // Try Vite environment variables first (for build-time compatibility)
  const viteValue = import.meta.env[viteKey];
  if (viteValue) return viteValue;
  
  // Try process environment variables (for standard Node.js environments)
  if (processKey && typeof process !== 'undefined') {
    const processValue = process.env[processKey];
    if (processValue) return processValue;
  }
  
  // Use fallback if provided
  if (fallback) return fallback;
  
  throw new Error(`Missing required environment variable: ${viteKey}${processKey ? ` or ${processKey}` : ''}`);
};

// Validate all required environment variables are present
export const validateEnvironment = (): boolean => {
  try {
    getEnvVar('VITE_SUPABASE_URL', 'SUPABASE_URL');
    getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY');
    return true;
  } catch (error) {
    productionLogger.error('Environment validation failed', error);
    return false;
  }
};