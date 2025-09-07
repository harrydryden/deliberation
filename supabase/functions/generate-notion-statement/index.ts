import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';
import { ModelConfigManager } from '../shared/model-config.ts';

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
    const { title, description } = await req.json();

    if (!title) {
      throw new Error('Title is required');
    }

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    console.log('Generating notion statement for:', { title, description });

    // Get notion statement prompt from template system
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const tempSupabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: templateData, error: templateError } = await tempSupabase
      .rpc('get_prompt_template', { 
        template_name: 'generate_notion_statement'
      });

    if (templateError || !templateData || templateData.length === 0) {
      throw new Error(`Failed to get prompt template: ${templateError?.message || 'Template not found'}`);
    }

    const template = templateData[0];
    
    // Replace template variables with actual values
    const descriptionText = description ? `Description: ${description}` : '';
    const combinedPrompt = template.template_text
      .replace(/\{\{title\}\}/g, title)
      .replace(/\{\{description\}\}/g, descriptionText);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...ModelConfigManager.generateAPIParams('gpt-5-2025-08-07', [
          { role: 'user', content: combinedPrompt }
        ], { maxTokens: 150 })
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const generatedNotion = data.choices[0].message.content.trim();

    console.log('Generated notion statement:', generatedNotion);

    return new Response(JSON.stringify({ notion: generatedNotion }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-notion-statement function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});