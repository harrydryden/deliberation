import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    console.log('🚀 Starting generate-ibis-roots function - BASIC TEST');
    
    // Parse request body
    let requestData;
    try {
      requestData = await req.json();
      console.log('📝 Request data received:', JSON.stringify(requestData, null, 2));
    } catch (jsonError) {
      console.error('❌ Failed to parse request JSON:', jsonError);
      throw new Error(`Invalid JSON in request: ${jsonError.message}`);
    }

    const { deliberationId, deliberationTitle, deliberationDescription, notion } = requestData;
    
    if (!deliberationId || !deliberationTitle) {
      throw new Error('Missing required fields: deliberationId and deliberationTitle');
    }

    console.log('✅ Request validation passed');

    // Test environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    console.log('🔧 Environment check:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasSupabaseKey: !!supabaseServiceKey,
      hasOpenAIKey: !!openaiApiKey
    });

    if (!supabaseUrl || !supabaseServiceKey || !openaiApiKey) {
      throw new Error('Missing required environment variables');
    }

    console.log('✅ Environment variables validated');

    // For now, just return mock data to test the basic flow
    const mockNodes = [
      {
        id: 'mock-1',
        title: `Test Issue 1 for ${deliberationTitle}`,
        description: 'This is a test issue to verify the function works',
        deliberation_id: deliberationId,
        node_type: 'issue',
        created_at: new Date().toISOString()
      },
      {
        id: 'mock-2', 
        title: `Test Issue 2 for ${deliberationTitle}`,
        description: 'This is another test issue to verify the function works',
        deliberation_id: deliberationId,
        node_type: 'issue',
        created_at: new Date().toISOString()
      }
    ];

    console.log('🎉 Returning mock data successfully');

    return new Response(JSON.stringify({ 
      success: true, 
      nodes: mockNodes,
      count: mockNodes.length,
      message: 'This is a test response - no real IBIS nodes were created'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Error in generate-ibis-roots function:', error);
    console.error('💥 Error stack:', error.stack);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});