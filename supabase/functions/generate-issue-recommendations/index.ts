import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, deliberationId, content, maxRecommendations = 2 } = await req.json();
    
    if (!userId || !deliberationId || !content) {
      throw new Error('Missing required fields: userId, deliberationId, or content');
    }

    console.log('🔍 Generating issue recommendations', { userId, deliberationId, contentLength: content.length });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openAIApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get existing issues for the deliberation
    const { data: existingIssues, error: issuesError } = await supabase
      .from('ibis_nodes')
      .select('id, title, description')
      .eq('deliberation_id', deliberationId)
      .eq('node_type', 'issue')
      .order('created_at', { ascending: false })
      .limit(20);

    if (issuesError) {
      throw new Error(`Error fetching existing issues: ${issuesError.message}`);
    }

    if (!existingIssues || existingIssues.length === 0) {
      console.log('📝 No existing issues found');
      return new Response(JSON.stringify({ recommendations: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Format issues for AI analysis
    const issuesContext = existingIssues.map(issue => 
      `- ${issue.title}${issue.description ? `: ${issue.description}` : ''} (ID: ${issue.id})`
    ).join('\n');

    // Create AI prompt for issue recommendations
    const aiPrompt = `You are analyzing user content to recommend existing issues from a deliberation discussion. Your task is to find the most relevant existing issues that the user's content relates to.

USER CONTENT:
"${content}"

EXISTING ISSUES:
${issuesContext}

Please analyze the user's content and identify the ${maxRecommendations} most relevant existing issues. For each recommendation, provide:
1. The exact issue ID (from the list above)
2. A relevance score between 0.6-1.0 (only recommend if score >= 0.6)  
3. A clear explanation of why this issue is relevant to the user's content

Respond with a JSON array in this exact format:
[
  {
    "issueId": "exact-uuid-from-list", 
    "relevanceScore": 0.85,
    "explanation": "This issue directly relates to the user's concern about..."
  }
]

Only include issues with relevance score >= 0.6. If no issues meet this threshold, return an empty array [].`;

    // Call OpenAI API
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at analyzing content and finding relevant issues in deliberative discussions. Always respond with valid JSON.'
          },
          {
            role: 'user',
            content: aiPrompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.3
      }),
    });

    if (!openAIResponse.ok) {
      const errorText = await openAIResponse.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${openAIResponse.status}`);
    }

    const openAIData = await openAIResponse.json();
    const aiResponseContent = openAIData.choices?.[0]?.message?.content;

    if (!aiResponseContent) {
      throw new Error('No response from OpenAI');
    }

    console.log('🤖 OpenAI raw response:', aiResponseContent);

    // Parse AI response
    let aiRecommendations;
    try {
      // Extract JSON from response (handle potential markdown formatting)
      const jsonMatch = aiResponseContent.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch ? jsonMatch[0] : aiResponseContent;
      aiRecommendations = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.error('Raw content:', aiResponseContent);
      throw new Error('Failed to parse AI recommendations');
    }

    // Validate and format recommendations
    const recommendations = [];
    for (const rec of aiRecommendations) {
      if (!rec.issueId || !rec.relevanceScore || !rec.explanation) {
        console.warn('Invalid recommendation format:', rec);
        continue;
      }

      // Find the matching issue
      const matchingIssue = existingIssues.find(issue => issue.id === rec.issueId);
      if (!matchingIssue) {
        console.warn('Issue ID not found in existing issues:', rec.issueId);
        continue;
      }

      if (rec.relevanceScore >= 0.6) {
        recommendations.push({
          issueId: matchingIssue.id,
          title: matchingIssue.title,
          description: matchingIssue.description,
          relevanceScore: rec.relevanceScore,
          explanation: rec.explanation
        });
      }
    }

    // Sort by relevance score
    recommendations.sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    // Limit to maxRecommendations
    const finalRecommendations = recommendations.slice(0, maxRecommendations);

    console.log('✅ Generated recommendations:', finalRecommendations.length);

    return new Response(JSON.stringify({ 
      recommendations: finalRecommendations,
      totalIssuesAnalyzed: existingIssues.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Issue recommendations error:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      recommendations: [] 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});