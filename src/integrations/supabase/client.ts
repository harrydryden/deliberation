import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://iowsxuxkgvpgrvvklwyt.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3N4dXhrZ3ZwZ3J2dmtsd3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMDAwOTYsImV4cCI6MjA2ODg3NjA5Nn0.WSXdI12OCdcJ-3ktEjdY9G5wHzzmD-98kBlJxPg1yhM'

// Create the base Supabase client
const baseSupabase = createClient(supabaseUrl, supabaseAnonKey)

// Get current user from auth context
const getCurrentUserId = (): string | null => {
  if (typeof localStorage === 'undefined') return null;
  
  const storedUser = localStorage.getItem('simple_auth_user');
  if (storedUser) {
    try {
      const user = JSON.parse(storedUser);
      return user.id || null;
    } catch {
      return null;
    }
  }
  return null;
};

// Enhanced Supabase client that automatically sets user context
const enhancedSupabase = {
  ...baseSupabase,
  
  // Override the from method to set user context
  from: (table: string) => {
    const userId = getCurrentUserId();
    const queryBuilder = baseSupabase.from(table);
    
    if (userId) {
      // Return a proxy that sets context before query execution
      return new Proxy(queryBuilder, {
        get(target, prop) {
          const value = target[prop as keyof typeof target];
          
          if (typeof value === 'function' && 
              ['select', 'insert', 'update', 'delete', 'upsert'].includes(prop as string)) {
            return async (...args: any[]) => {
              try {
                // Set the PostgreSQL context variable before executing query
                await baseSupabase.rpc('set_config', {
                  setting_name: 'app.current_user_id',
                  new_value: userId,
                  is_local: true
                });
              } catch (error) {
                // If set_config fails, continue with query (for backwards compatibility)
                console.warn('Failed to set user context:', error);
              }
              
              // Execute the original query
              return (value as Function).apply(target, args);
            };
          }
          
          return typeof value === 'function' ? value.bind(target) : value;
        }
      });
    }
    
    return queryBuilder;
  },
  
  // Override RPC to set user context
  rpc: (functionName: string, params?: any) => {
    const userId = getCurrentUserId();
    
    if (userId && functionName !== 'set_config') {
      // For RPC calls, we need to set context differently
      return new Proxy(baseSupabase.rpc(functionName, params), {
        get(target, prop) {
          const value = target[prop as keyof typeof target];
          
          if (prop === 'single' || prop === 'maybeSingle') {
            return async () => {
              try {
                await baseSupabase.rpc('set_config', {
                  setting_name: 'app.current_user_id',
                  new_value: userId,
                  is_local: true
                });
              } catch (error) {
                console.warn('Failed to set user context for RPC:', error);
              }
              
              return (value as Function).apply(target);
            };
          }
          
          return typeof value === 'function' ? value.bind(target) : value;
        }
      });
    }
    
    return baseSupabase.rpc(functionName, params);
  },
  
  // Expose all other Supabase client properties/methods
  auth: baseSupabase.auth,
  functions: baseSupabase.functions,
  storage: baseSupabase.storage,
  realtime: baseSupabase.realtime,
  channel: baseSupabase.channel,
  removeChannel: baseSupabase.removeChannel,
  getChannels: baseSupabase.getChannels,
  removeAllChannels: baseSupabase.removeAllChannels
};

export const supabase = enhancedSupabase;