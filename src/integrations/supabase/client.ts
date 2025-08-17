import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://iowsxuxkgvpgrvvklwyt.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3N4dXhrZ3ZwZ3J2dmtsd3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMDAwOTYsImV4cCI6MjA2ODg3NjA5Nn0.WSXdI12OCdcJ-3ktEjdY9G5wHzzmD-98kBlJxPg1yhM'

// Create the base Supabase client
const baseSupabase = createClient(supabaseUrl, supabaseAnonKey)

// Get current user from auth context
const getCurrentUserId = (): string | null => {
  if (typeof localStorage === 'undefined') return null;
  
  const storedUser = localStorage.getItem('simple_auth_user');
  console.log('StoredUser from localStorage:', storedUser);
  
  if (storedUser) {
    try {
      const user = JSON.parse(storedUser);
      console.log('Parsed user:', user);
      console.log('User ID extracted:', user.id);
      return user.id || null;
    } catch (error) {
      console.error('Error parsing stored user:', error);
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
      // Create a proxy to intercept query execution methods
      return new Proxy(queryBuilder, {
        get(target, prop) {
          const value = target[prop as keyof typeof target];
          
          // Intercept execution methods to set context first
          if (typeof value === 'function' && 
              ['select', 'insert', 'update', 'delete', 'upsert'].includes(prop as string)) {
            return function(...args: any[]) {
              const result = (value as Function).apply(target, args);
              
              // Create proxy for the query result to set context before execution
              return new Proxy(result, {
                get(resultTarget, resultProp) {
                  const resultValue = resultTarget[resultProp as keyof typeof resultTarget];
                  
                  if (typeof resultValue === 'function' && 
                      ['then', 'catch', 'finally'].includes(resultProp as string)) {
                    return function(...execArgs: any[]) {
                      // Set context before executing the query
                      return Promise.resolve(baseSupabase.rpc('set_config', {
                        setting_name: 'app.current_user_id',
                        new_value: userId,
                        is_local: true
                      })).then(() => {
                        return (resultValue as Function).apply(resultTarget, execArgs);
                      }).catch((contextError) => {
                        console.warn('Failed to set user context:', contextError);
                        // Execute query anyway even if context setting fails
                        return (resultValue as Function).apply(resultTarget, execArgs);
                      });
                    };
                  }
                  
                  return typeof resultValue === 'function' ? resultValue.bind(resultTarget) : resultValue;
                }
              });
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
      // Set context first, then execute RPC
      return Promise.resolve(baseSupabase.rpc('set_config', {
        setting_name: 'app.current_user_id',
        new_value: userId,
        is_local: true
      })).then(() => {
        return baseSupabase.rpc(functionName, params);
      }).catch((contextError) => {
        console.warn('Failed to set user context for RPC:', contextError);
        // Execute RPC anyway even if context setting fails
        return baseSupabase.rpc(functionName, params);
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