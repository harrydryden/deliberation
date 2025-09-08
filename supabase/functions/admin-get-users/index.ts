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
    const { userSupabase } = validateAndGetEnvironment();

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
    
    // Verify the token and get user using user client
    console.log('👤 Verifying user token...');
    const { data: { user }, error: userError } = await userSupabase.auth.getUser(token);
    if (userError || !user) {
      console.error('❌ Invalid user token:', userError);
      return createErrorResponse('Invalid user token', 401);
    }

    console.log('✅ User verified:', user.id);

    // Check if user has admin role using service client
    console.log('🔍 Checking admin role for user:', user.id);
    const { supabase } = validateAndGetEnvironment();
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
      .eq('is_archived', false);

    if (profilesError) {
      console.error('❌ Failed to fetch profiles:', profilesError);
      return createErrorResponse('Failed to fetch profiles', 500);
    }

    if (!profiles || profiles.length === 0) {
      console.log('📋 No profiles found, returning empty array');
      return createSuccessResponse({ users: [] });
    }

    console.log(`📋 Found ${profiles.length} profiles`);

    // Create service role client for admin operations  
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceRoleKey) {
      console.error('❌ Service role key not found');
      return createErrorResponse('Service configuration error', 500);
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceRoleKey
    );

    // Get auth users with service role to access metadata
    console.log('🔐 Fetching auth users with service role...');
    const { data: authData, error: authError } = await serviceSupabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('❌ Failed to fetch auth users:', authError);
    }
    
    // Create a map of auth user data
    const authUsersMap = new Map();
    if (authData?.users) {
      authData.users.forEach((authUser) => {
        authUsersMap.set(authUser.id, authUser);
      });
    }

    console.log(`🔐 Found ${authUsersMap.size} auth users`);

    // Get participants with deliberations
    console.log('🔍 Fetching participants and deliberations...');
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
      .in('user_id', userIds.map(id => id.toString()));

    console.log(`👥 Found ${participants?.length || 0} participant entries`);

    // Create map for efficient lookups
    const deliberationsMap = new Map();
    
    // Initialize deliberations map
    profiles.forEach(profile => {
      deliberationsMap.set(profile.id, []);
    });

    // Populate deliberations map
    participants?.forEach((p) => {
      const userId = p.user_id;
      if (deliberationsMap.has(userId) && p.deliberations) {
        deliberationsMap.get(userId).push({
          id: p.deliberations.id,
          title: p.deliberations.title,
          role: p.role || 'participant'
        });
      }
    });

    // Map profiles to user data
    console.log('🏗️ Building user data...');
    const users = profiles.map(profile => {
      const role = profile.user_role || 'user';
      const deliberations = deliberationsMap.get(profile.id) || [];
      const authUser = authUsersMap.get(profile.id);
      
      return {
        id: profile.id,
        email: authUser?.email || profile.access_code_1 || `user-${profile.id.slice(0, 8)}@example.com`,
        emailConfirmedAt: profile.created_at,
        createdAt: profile.created_at,
        lastSignInAt: profile.updated_at,
        role: role,
        accessCode1: profile.access_code_1,
        accessCode2: profile.access_code_2,
        profile: {
          displayName: profile.access_code_1 || `User ${profile.id.slice(0, 8)}`,
          avatarUrl: '',
          bio: '',
          expertiseAreas: [],
        },
        deliberations: deliberations,
        isArchived: profile.is_archived || false,
        archivedAt: profile.archived_at,
        archivedBy: profile.archived_by,
        archiveReason: profile.archive_reason,
      };
    });

    console.log(`✅ Successfully processed ${users.length} users`);
    return createSuccessResponse({ users });

  } catch (error) {
    console.error('💥 Unexpected error in admin-get-users:', error);
    return createErrorResponse(`Internal server error: ${error.message}`, 500);
  }
})