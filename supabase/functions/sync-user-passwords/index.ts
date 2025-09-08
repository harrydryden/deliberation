import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

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
    // Get environment and clients with caching
    const { supabase: supabaseAdmin } = validateAndGetEnvironment();
    
    // Get regular client for checking auth
    const { supabase: supabaseRegular } = validateAndGetEnvironment('anon');

    // Get auth header and verify admin access
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return createErrorResponse('No authorization header', 401);
    }

    // Set auth for regular client
    supabaseRegular.auth.setSession({
      access_token: authHeader.replace('Bearer ', ''),
      refresh_token: ''
    } as any)

    // Check if user is admin
    const { data: { user } } = await supabaseRegular.auth.getUser();
    if (!user) {
      return createErrorResponse('Unauthorized', 401);
    }

    const { data: profile } = await supabaseRegular
      .from('profiles')
      .select('user_role')
      .eq('id', user.id)
      .single();

    if (profile?.user_role !== 'admin') {
      return createErrorResponse('Admin access required', 403);
    }

    // Get all profiles with access codes
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, access_code_1, access_code_2')
      .not('access_code_2', 'is', null)
      .neq('access_code_2', '');

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      return createErrorResponse('Failed to fetch profiles', 500);
    }

    let updated = 0;
    let errors = 0;

    // Update passwords for all users
    for (const profile of profiles || []) {
      try {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(
          profile.id,
          { password: profile.access_code_2 }
        );

        if (error) {
          console.error(`Error updating password for user ${profile.id}:`, error);
          errors++;
        } else {
          console.log(`Password updated for user ${profile.access_code_1}`);
          updated++;
        }
      } catch (error) {
        console.error(`Exception updating password for user ${profile.id}:`, error);
        errors++;
      }
    }

    return createSuccessResponse({ 
      success: true, 
      message: `Updated ${updated} user passwords, ${errors} errors`,
      updated,
      errors
    });

  } catch (error) {
    console.error('Sync passwords error:', error);
    return createErrorResponse(error, 500, 'sync-user-passwords');
  }
});