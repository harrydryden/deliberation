// Environment validation and configuration for production self-hosting
// This ensures all required environment variables are present at startup

import { logger } from '@/utils/logger';

interface RequiredConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  projectId?: string;
  nodeEnv: string;
}

interface OptionalConfig {
  openaiApiKey?: string;
  serviceRoleKey?: string;
}

export interface AppConfig extends RequiredConfig, OptionalConfig {}

// Validate and get all configuration at startup
export const validateAndGetConfig = (): AppConfig => {
  // Required environment variables
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 
                     (typeof process !== 'undefined' ? process.env.SUPABASE_URL : null);
  
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 
                          import.meta.env.VITE_SUPABASE_ANON_KEY ||
                          (typeof process !== 'undefined' ? process.env.SUPABASE_ANON_KEY : null);

  const nodeEnv = import.meta.env.NODE_ENV || 
                  (typeof process !== 'undefined' ? process.env.NODE_ENV : null) || 
                  'development';

  // Validate required configuration
  const missing: string[] = [];
  
  if (!supabaseUrl) missing.push('SUPABASE_URL or VITE_SUPABASE_URL');
  if (!supabaseAnonKey) missing.push('SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY');

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n\n` +
      `Please ensure you have set these variables in your environment or .env file.\n` +
      `See .env.example for reference.`
    );
  }

  // Optional configuration (with warnings for production)
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 
                   (typeof process !== 'undefined' ? process.env.SUPABASE_PROJECT_ID : null);

  const config: AppConfig = {
    supabaseUrl: supabaseUrl!,
    supabaseAnonKey: supabaseAnonKey!,
    nodeEnv,
    projectId: projectId || undefined,
  };

  // Development warnings - only in non-production
  if (nodeEnv !== 'production') {
    logger.info('Environment Configuration Loaded:', {
      supabaseUrl: config.supabaseUrl.replace(/\/\/.*\./, '//*****.'),
      hasProjectId: !!config.projectId,
      nodeEnv: config.nodeEnv,
    });
  }

  return config;
};

// Export validated configuration
export const appConfig = validateAndGetConfig();

// Environment helpers
export const isProduction = () => appConfig.nodeEnv === 'production';
export const isDevelopment = () => appConfig.nodeEnv === 'development';
export const isTest = () => appConfig.nodeEnv === 'test';

// Configuration getters
export const getSupabaseUrl = () => appConfig.supabaseUrl;
export const getSupabaseAnonKey = () => appConfig.supabaseAnonKey;
export const getProjectId = () => appConfig.projectId;

// Startup validation - call this early in your app
export const validateStartup = (): void => {
  try {
    validateAndGetConfig();
    
    // Only log validation messages in non-production
    if (isProduction()) {
      // Silent in production
    } else {
      logger.info('Development environment validated');
    }
  } catch (error) {
    // Always log critical errors
    throw error;
  }
};