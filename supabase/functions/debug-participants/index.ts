import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { deliberationId, userIds } = await req.json();

    if (!deliberationId || !userIds) {
      return new Response(JSON.stringify({ error: 'Missing deliberationId or userIds' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get all participants for this deliberation
    const { data: participants, error: participantsError } = await supabase
      .from('participants')
      .select('user_id, id, joined_at')
      .eq('deliberation_id', deliberationId);

    if (participantsError) {
      console.error('Error fetching participants:', participantsError);
      return new Response(JSON.stringify({ 
        error: 'Error fetching participants', 
        details: participantsError.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get deliberation info
    const { data: deliberation } = await supabase
      .from('deliberations')
      .select('id, title, status')
      .eq('id', deliberationId)
      .single();

    // Check which user IDs are participants
    const participantUserIds = participants?.map(p => p.user_id) || [];
    const checkResults = userIds.map((userId: string) => ({
      userId,
      isParticipant: participantUserIds.includes(userId),
      exactMatch: participantUserIds.find(p => p === userId) !== undefined,
      typeInfo: {
        csvType: typeof userId,
        csvValue: userId,
        participantValues: participantUserIds.filter(p => p.toLowerCase() === userId.toLowerCase())
      }
    }));

    return new Response(JSON.stringify({
      deliberation,
      totalParticipants: participants?.length || 0,
      participantUserIds,
      checkResults,
      debugInfo: {
        csvUserIds: userIds,
        participantUserIds,
        missingUsers: userIds.filter((id: string) => !participantUserIds.includes(id))
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in debug-participants function:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});