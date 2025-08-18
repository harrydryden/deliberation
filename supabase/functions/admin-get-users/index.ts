import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('Admin get users function called')
    
    // Create Supabase client with service role key for admin operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verify the requesting user is an admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.log('No authorization header')
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Authorization header present')

    // Extract token from Bearer format
    const token = authHeader.replace('Bearer ', '')
    
    // Verify the token and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      console.log('Invalid user token:', userError)
      return new Response(
        JSON.stringify({ error: 'Invalid user token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('User verified:', user.id)

    // Check if user has admin role
    const { data: userRoles, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')

    if (roleError || !userRoles || userRoles.length === 0) {
      console.log('User not admin:', roleError, userRoles)
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Admin verified, fetching data')

    // Get profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_archived', false)

    if (profilesError) {
      console.error('Profiles error:', profilesError)
      throw profilesError
    }

    console.log('Profiles fetched:', profiles?.length || 0)

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ users: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get auth users with admin privileges  
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
    
    if (authError) {
      console.error('Auth error:', authError)
      // Continue without auth data instead of throwing
    }

    console.log('Auth users fetched:', authUsers?.users?.length || 0)

    // Create a map of auth user data
    const authUsersMap = new Map()
    if (authUsers?.users) {
      authUsers.users.forEach((authUser) => {
        authUsersMap.set(authUser.id, authUser)
      })
    }

    // Get user roles
    const userIds = profiles.map(p => p.id)
    const { data: allUserRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .in('user_id', userIds)

    if (rolesError) {
      console.error('Roles error:', rolesError)
    }

    console.log('User roles fetched:', allUserRoles?.length || 0)

    // Get participants
    const { data: participants, error: participantsError } = await supabase
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

    if (participantsError) {
      console.error('Participants error:', participantsError)
    }

    console.log('Participants fetched:', participants?.length || 0)

    // Create maps for efficient lookups
    const rolesMap = new Map(allUserRoles?.map(r => [r.user_id, r.role]) || [])
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
      const role = rolesMap.get(profile.id) || 'user'
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

    console.log('Users processed:', users.length)

    return new Response(
      JSON.stringify({ users }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})