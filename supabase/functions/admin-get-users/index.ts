import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Import shared utilities for performance and consistency
import { 
  corsHeaders, 
  validateAndGetEnvironment, 
  createErrorResponse, 
  createSuccessResponse,
  handleCORSPreflight
} from '../shared/edge-function-utils.ts';

serve(async (req) => {
  // Handle CORS preflight with shared utility
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    console.log('📋 Admin get users function called');
    
    // Get environment and clients with caching
    const { supabase } = validateAndGetEnvironment();

    // Verify the requesting user is an admin
    console.log('🔐 Checking authorization header...');
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('❌ No authorization header found');
      return createErrorResponse('No authorization header', 401);
    }

    // Extract token from Bearer format
    console.log('🎫 Extracting token from authorization header...');
    const token = authHeader.replace('Bearer ', '');
    
    // Verify the token and get user
    console.log('👤 Verifying user token...');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      console.error('❌ Invalid user token:', userError);
      return createErrorResponse('Invalid user token', 401);
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
      return createErrorResponse('Admin access required', 403);
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

    // Map profiles to user data
    const users = profiles.map(profile => {
      const role = profile.user_role || 'user'
      const deliberations = deliberationsMap.get(profile.id) || []
      const authUser = authUsersMap.get(profile.id)
      
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