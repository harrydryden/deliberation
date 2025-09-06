import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get regular client for checking auth
    const supabaseRegular = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get auth header and verify admin access
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Set auth for regular client
    supabaseRegular.auth.setSession({
      access_token: authHeader.replace('Bearer ', ''),
      refresh_token: ''
    } as any)

    // Check if user is admin
    const { data: { user } } = await supabaseRegular.auth.getUser()
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const { data: profile } = await supabaseRegular
      .from('profiles')
      .select('user_role')
      .eq('id', user.id)
      .single()

    if (profile?.user_role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get all profiles with access codes
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, access_code_1, access_code_2')
      .not('access_code_2', 'is', null)
      .neq('access_code_2', '')

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch profiles' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    let updated = 0
    let errors = 0

    // Update passwords for all users
    for (const profile of profiles || []) {
      try {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(
          profile.id,
          { password: profile.access_code_2 }
        )

        if (error) {
          console.error(`Error updating password for user ${profile.id}:`, error)
          errors++
        } else {
          console.log(`Password updated for user ${profile.access_code_1}`)
          updated++
        }
      } catch (error) {
        console.error(`Exception updating password for user ${profile.id}:`, error)
        errors++
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Updated ${updated} user passwords, ${errors} errors`,
        updated,
        errors
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Sync passwords error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})