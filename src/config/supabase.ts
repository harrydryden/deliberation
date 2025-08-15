// Simplified Supabase-only configuration
export const SUPABASE_CONFIG = {
  url: 'https://iowsxuxkgvpgrvvklwyt.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3N4dXhrZ3ZwZ3J2dmtsd3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMDAwOTYsImV4cCI6MjA2ODg3NjA5Nn0.WSXdI12OCdcJ-3ktEjdY9G5wHzzmD-98kBlJxPg1yhM',
} as const;

export type DatabaseTables = 'users' | 'messages' | 'deliberations' | 'agent_configurations' | 'access_codes' | 'profiles';