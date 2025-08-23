import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create a Supabase client with service role key for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Verify the request is from an authenticated admin
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    
    const { data: user, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user is admin
    const { data: userRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.user.id)
    
    const isAdmin = userRoles?.some(r => r.role === 'admin') || false
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { count, roleType } = await req.json()

    if (!count || count < 1 || count > 50) {
      return new Response(
        JSON.stringify({ error: 'Invalid count. Must be between 1 and 50.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const generateAccessCode1 = (): string => {
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      let result = ''
      for (let i = 0; i < 5; i++) {
        result += letters.charAt(Math.floor(Math.random() * letters.length))
      }
      return result
    }

    const generateAccessCode2 = (): string => {
      return Math.floor(100000 + Math.random() * 900000).toString()
    }

    const users = []

    for (let i = 0; i < count; i++) {
      const accessCode1 = generateAccessCode1()
      const accessCode2 = generateAccessCode2()
      const email = `${accessCode1}@deliberation.local`

      // Create user using admin client (doesn't trigger auth state changes)
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: accessCode2,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
          access_code_1: accessCode1,
          access_code_2: accessCode2,
          role: roleType
        }
      })

      if (authError) {
        console.error('Error creating user:', authError)
        continue
      }

      if (authData.user) {
        // Create profile
        await supabaseAdmin
          .from('profiles')
          .insert({
            id: authData.user.id,
            access_code_1: accessCode1,
            access_code_2: accessCode2,
            role: roleType,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_archived: false
          })

        // Add role to user_roles table
        await supabaseAdmin
          .from('user_roles')
          .insert({
            user_id: authData.user.id,
            role: roleType
          })

        users.push({
          accessCode1,
          accessCode2,
          role: roleType
        })
      }
    }

    return new Response(
      JSON.stringify({ users }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})