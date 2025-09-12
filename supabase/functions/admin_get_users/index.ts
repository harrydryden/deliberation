import { serve } from "std/http/server.ts";
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function handleCORSPreflight(request: Request): Response | null {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

function createErrorResponse(error: any, status: number = 500, context?: string): Response {
  const errorId = crypto.randomUUID();
  console.error(`[${errorId}] ${context || 'admin_get_users error'}:`, error);
  
  return new Response(
    JSON.stringify({ 
      error: error?.message || 'Internal server error', 
      errorId,
      timestamp: new Date().toISOString()
    }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status 
    }
  );
}

function createSuccessResponse(data: any): Response {
  return new Response(
    JSON.stringify(data),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 
    }
  );
}

serve(async (req) => {
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    console.log('Admin get users request received');

    // Initialize Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error('Missing required Supabase environment variables');
    }

    // Create admin client with service role for elevated permissions
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Create user client for JWT verification
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Verify JWT token and get user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return createErrorResponse(new Error('Authorization header missing'), 401);
    }

    const { data: { user }, error: authError } = await userSupabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      console.error('Authentication failed:', authError);
      return createErrorResponse(new Error('Authentication failed'), 401);
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await adminSupabase
      .from('profiles')
      .select('user_role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || profile.user_role !== 'admin') {
      console.warn('Non-admin user attempted access:', user.id);
      return createErrorResponse(new Error('Admin access required'), 403);
    }

    console.log('Admin access verified for user:', user.id);

    // Fetch all user profiles (non-archived)
    const { data: profiles, error: profilesError } = await adminSupabase
      .from('profiles')
      .select('*')
      .neq('archived', true);

    if (profilesError) {
      throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
    }

    // Fetch all users from Supabase Auth using service role
    const { data: { users }, error: usersError } = await adminSupabase.auth.admin.listUsers();

    if (usersError) {
      throw new Error(`Failed to fetch auth users: ${usersError.message}`);
    }

    // Fetch participant data to get deliberation associations
    const { data: participants, error: participantsError } = await adminSupabase
      .from('participants')
      .select(`
        user_id,
        deliberation_id,
        deliberations (
          id,
          title,
          notion
        )
      `);

    if (participantsError) {
      console.warn('Failed to fetch participants:', participantsError);
    }

    // Combine and map the data
    const combinedUsers = profiles?.map(profile => {
      const authUser = users.find(u => u.id === profile.id);
      const userParticipations = participants?.filter(p => p.user_id === profile.id) || [];
      
      return {
        id: profile.id,
        email: authUser?.email || 'N/A',
        role: profile.user_role,
        access_code_1: profile.access_code_1,
        access_code_2: profile.access_code_2,
        created_at: profile.created_at,
        last_sign_in: authUser?.last_sign_in_at,
        email_confirmed_at: authUser?.email_confirmed_at,
        deliberations: userParticipations.map(p => ({
          id: p.deliberation_id,
          title: p.deliberations?.title || 'Unknown',
          notion: p.deliberations?.notion
        }))
      };
    }) || [];

    console.log(`Successfully retrieved ${combinedUsers.length} users`);

    return createSuccessResponse({
      users: combinedUsers,
      total: combinedUsers.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return createErrorResponse(error, 500, 'admin_get_users');
  }
});