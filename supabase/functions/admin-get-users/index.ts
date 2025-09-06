import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('📋 Admin get users function called');
    // Create Supabase client with service role key for admin operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Missing Supabase configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify the requesting user is an admin
    console.log('🔐 Checking authorization header...');
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.error('❌ No authorization header found');
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Extract token from Bearer format
    console.log('🎫 Extracting token from authorization header...');
    const token = authHeader.replace('Bearer ', '')
    
    // Verify the token and get user
    console.log('👤 Verifying user token...');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      console.error('❌ Invalid user token:', userError);
      return new Response(
        JSON.stringify({ error: 'Invalid user token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('✅ User verified:', user.id);

    // Check if user has admin role
    console.log('🔍 Checking admin role for user:', user.id);
    const { data: userProfile, error: roleError } = await supabase
      .from('profiles')
      .select('user_role')
      .eq('id', user.id)
      .single();

    console.log('📋 User profile query result:', { userProfile, roleError });

    if (roleError || !userProfile || userProfile.user_role !== 'admin') {
      console.error('❌ Admin access check failed:', { roleError, userProfile, userId: user.id });
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('✅ Admin access verified for user:', user.id);

    // Get profiles first
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_archived', false)

    if (profilesError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch profiles' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ users: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get auth users with service role to access metadata
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers()
    
    // Create a map of auth user data
    const authUsersMap = new Map()
    if (authData?.users) {
      authData.users.forEach((authUser) => {
        authUsersMap.set(authUser.id, authUser)
      })
    }

    // User roles are now stored directly in profiles table

    // Get participants with deliberations
    const userIds = profiles.map(p => p.id);
    const { data: participants } = await supabase
      .from('participants')
      .select(`
        user_id,
        role,
        deliberations (
          id,
          title
        )
      `)
      .in('user_id', userIds.map(id => id.toString()))

    // Create map for efficient lookups
    const deliberationsMap = new Map()
    
    // Initialize deliberations map
    profiles.forEach(profile => {
      deliberationsMap.set(profile.id, [])
    })

    // Populate deliberations map
    participants?.forEach((p) => {
      const userId = p.user_id
      if (deliberationsMap.has(userId) && p.deliberations) {
        deliberationsMap.get(userId).push({
          id: p.deliberations.id,
          title: p.deliberations.title,
          role: p.role || 'participant'
        })
      }
    })

    // Map profiles to user data with access codes
    const users = profiles.map(profile => {
      const role = profile.user_role || 'user'
      const deliberations = deliberationsMap.get(profile.id) || []
      const authUser = authUsersMap.get(profile.id)

      // Extract access codes from auth metadata
      const accessCode1 = authUser?.user_metadata?.access_code_1 || authUser?.raw_user_meta_data?.access_code_1
      const accessCode2 = authUser?.user_metadata?.access_code_2 || authUser?.raw_user_meta_data?.access_code_2
      
      return {
        id: profile.id,
        email: authUser?.email || `user-${profile.id.slice(0, 8)}@example.com`,
        emailConfirmedAt: profile.created_at,
        createdAt: profile.created_at,
        lastSignInAt: profile.updated_at,
        role: role,
        profile: {
          displayName: `User ${profile.id.slice(0, 8)}`,
          avatarUrl: '',
          bio: '',
          expertiseAreas: [],
        },
        deliberations: deliberations,
        isArchived: profile.is_archived || false,
        archivedAt: profile.archived_at,
        archivedBy: profile.archived_by,
        archiveReason: profile.archive_reason,
        accessCode1: accessCode1,
        accessCode2: accessCode2,
      }
    })

    return new Response(
      JSON.stringify({ users }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})