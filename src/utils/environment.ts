// Production environment configuration utilities
export const isProduction = (): boolean => {
  return import.meta.env.MODE === 'production';
};

export const isDevelopment = (): boolean => {
  return import.meta.env.MODE === 'development';
};

export const isTest = (): boolean => {
  return import.meta.env.MODE === 'test';
};

// Get environment variable with fallback
export const getEnvVar = (key: string, fallback?: string): string => {
  const value = import.meta.env[key];
  if (value) return value;
  if (fallback) return fallback;
  throw new Error(`Missing required environment variable: ${key}`);
};

// Validate required environment variables
export const validateEnvironment = (): boolean => {
  try {
    getEnvVar('VITE_SUPABASE_URL');
    getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY');
    return true;
  } catch {
    return false;
  }
};