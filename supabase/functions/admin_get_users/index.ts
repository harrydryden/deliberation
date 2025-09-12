import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.52.1";

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

    // Fetch all user profiles - get all first, then filter in code if needed
    const { data: profiles, error: profilesError } = await adminSupabase
      .from('profiles')
      .select('id, user_role, access_code_1, access_code_2, is_archived, created_at, archived_at, archived_by, archive_reason');

    if (profilesError) {
      throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
    }

    // Fetch all users from Supabase Auth using service role
    const { data: { users }, error: usersError } = await adminSupabase.auth.admin.listUsers();

    if (usersError) {
      throw new Error(`Failed to fetch auth users: ${usersError.message}`);
    }

    // Fetch participant data to get deliberation associations (without join to avoid FK requirement)
    const { data: participants, error: participantsError } = await adminSupabase
      .from('participants')
      .select('user_id, deliberation_id');

    if (participantsError) {
      console.warn('Failed to fetch participants:', participantsError);
    }

    // Fetch deliberation titles for associated participations
    const deliberationIds = Array.from(new Set((participants || []).map((p: any) => p.deliberation_id))).filter(Boolean);
    let deliberationsMap: Record<string, { id: string; title: string; notion?: string }> = {};
    if (deliberationIds.length > 0) {
      const { data: deliberations, error: deliberationsError } = await adminSupabase
        .from('deliberations')
        .select('id, title, notion')
        .in('id', deliberationIds);

      if (deliberationsError) {
        console.warn('Failed to fetch deliberations:', deliberationsError);
      } else {
        deliberationsMap = (deliberations || []).reduce((acc: any, d: any) => {
          acc[d.id] = { id: d.id, title: d.title, notion: d.notion };
          return acc;
        }, {} as Record<string, { id: string; title: string; notion?: string }>);
      }
    }

    // Combine and map the data, filtering out archived users
    const combinedUsers = profiles?.filter(profile => !profile.is_archived).map(profile => {
      const authUser = users.find(u => u.id === profile.id);
      const userParticipations = participants?.filter(p => p.user_id === profile.id) || [];
      
      return {
        id: profile.id,
        email: authUser?.email || 'N/A',
        role: profile.user_role,
        accessCode1: profile.access_code_1,
        accessCode2: profile.access_code_2,
        isArchived: profile.is_archived || false,
        createdAt: profile.created_at,
        lastSignInAt: authUser?.last_sign_in_at,
        emailConfirmedAt: authUser?.email_confirmed_at,
        deliberations: userParticipations.map(p => {
          const d = deliberationsMap[p.deliberation_id];
          return {
            id: p.deliberation_id,
            title: d?.title || 'Unknown',
            role: 'participant'
          };
        })
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