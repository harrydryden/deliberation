// Environment-based Supabase configuration for self-hosting
// This file is now deprecated in favor of src/config/environment.ts
// Kept for backwards compatibility during transition

import { getSupabaseUrl, getSupabaseAnonKey } from './environment';

export const SUPABASE_CONFIG = {
  url: getSupabaseUrl(),
  anonKey: getSupabaseAnonKey(),
} as const;

export type DatabaseTables = 'users' | 'messages' | 'deliberations' | 'agent_configurations' | 'profiles';