export type BackendType = 'supabase' | 'nodejs';

export interface BackendConfig {
  type: BackendType;
  apiUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

export const getBackendConfig = (): BackendConfig => {
  // Check for environment variable to force backend type
  const forcedBackend = import.meta.env.VITE_BACKEND_TYPE as BackendType;
  
  if (forcedBackend === 'nodejs') {
    return {
      type: 'nodejs',
      apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000',
    };
  }
  
  // Default to Supabase
  return {
    type: 'supabase',
    supabaseUrl: 'https://iowsxuxkgvpgrvvklwyt.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3N4dXhrZ3ZwZ3J2dmtsd3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMDAwOTYsImV4cCI6MjA2ODg3NjA5Nn0.WSXdI12OCdcJ-3ktEjdY9G5wHzzmD-98kBlJxPg1yhM',
  };
};

export const BACKEND_CONFIG = getBackendConfig();