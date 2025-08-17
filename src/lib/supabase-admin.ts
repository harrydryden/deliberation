import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://iowsxuxkgvpgrvvklwyt.supabase.co';

// Create admin client with service role key for bypassing RLS
export const createAdminClient = () => {
  // This will be set via edge function with service role key
  return createClient(supabaseUrl, '', {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
};

// Regular client for normal operations
export { supabase } from '@/integrations/supabase/client';