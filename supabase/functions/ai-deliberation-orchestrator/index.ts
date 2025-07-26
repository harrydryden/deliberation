import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = "claude-3-5-sonnet-20241022";
const RELEVANCE_THRESHOLD = 0.6;

// Helper class for session state management
class SessionState {
  constructor(userId: string, sessionData: any = {}) {
    this.userId = userId;
    this.userLoggedIn = true;
    this.lastMessageTime = sessionData.lastMessageTime || Date.now();
    this.minutesSinceLastMessage = Math.floor((Date.now() - this.lastMessageTime) / 60000);
    this.messageCount = sessionData.messageCount || 0;
    this.statementCount = sessionData.statementCount || 0;
    this.questionCount = sessionData.questionCount || 0;
    this.topicsEngaged = sessionData.topicsEngaged || [];
    this.usedQuestionIds = sessionData.usedQuestionIds || [];
    this.proactivePromptsCount = sessionData.proactivePromptsCount || 0;
    this.optedOutOfPrompts = sessionData.optedOutOfPrompts || false;
  }
  
  updateActivity(inputType: string) {
    this.lastMessageTime = Date.now();
    this.minutesSinceLastMessage = 0;
    this.messageCount++;
    
    if (inputType === 'STATEMENT') this.statementCount++;
    if (inputType === 'QUESTION') this.questionCount++;
  }
}

// Facilitation questions for proactive engagement
const FACILITATION_QUESTIONS = [
  {
    id: "explore_perspective",
    question: "I noticed you've been reading others' perspectives. What aspect of this topic resonates most with you?",
    context: "passive_reading"
  },
  {
    id: "invite_contribution", 
    question: "You've been exploring different viewpoints. Would you like to share your own thoughts on this issue?",
    context: "no_statements_yet"
  },
  {
    id: "deepen_understanding",
    question: "Having seen various arguments, what questions remain unanswered for you?",
    context: "high_engagement"
  },
  {
    id: "bridge_perspectives",
    question: "You've engaged with both supporting and opposing views. Can you see any common ground between them?",
    context: "viewed_multiple_perspectives"
  }
];

async function classifyInput(userInput: string, anthropicKey: string) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 50,
        temperature: 0.3,
        messages: [{
          role: "user",
          content: `Classify the following user input into exactly one category:

User input: "${userInput}"

Categories:
- QUESTION: Information seeking, asking for facts or explanations
- STATEMENT: Expressing opinion, making argument, taking position
- OTHER: Greetings, meta-questions, general queries

Respond with only the category name.`
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content[0].text.trim();
  } catch (error) {
    console.error('Classification error, using fallback:', error);
    // Fallback to simple heuristics
    if (userInput.includes('?')) return 'QUESTION';
    if (['believe', 'think', 'should', 'support', 'oppose'].some(word => 
      userInput.toLowerCase().includes(word))) {
      return 'STATEMENT';
    }
    return 'OTHER';
  }
}

function shouldTriggerProactiveEngagement(sessionState: SessionState): boolean {
  return (
    sessionState.userLoggedIn &&
    sessionState.minutesSinceLastMessage >= 5 &&
    sessionState.proactivePromptsCount < 3 &&
    !sessionState.optedOutOfPrompts
  );
}

async function handleProactiveEngagement(userContext: any, sessionState: SessionState, anthropicKey: string) {
  const userBehavior = analyzeUserBehavior(sessionState);
  const selectedQuestion = selectBestQuestion(userBehavior, sessionState.usedQuestionIds);
  
  if (!selectedQuestion) return [];

  // Personalize using Claude
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 150,
      temperature: 0.8,
      messages: [{
        role: "user",
        content: `Personalize this facilitation question based on user context:

Base question: "${selectedQuestion.question}"
User has engaged with: ${sessionState.topicsEngaged.join(', ')}
Participation level: ${userBehavior.engagementLevel}

Make it conversational and relevant to their journey. Keep under 100 words.`
      }]
    })
  });

  if (!response.ok) {
    console.error('Error personalizing question:', await response.text());
    return [];
  }

  const data = await response.json();
  
  // Track usage
  sessionState.usedQuestionIds.push(selectedQuestion.id);
  sessionState.proactivePromptsCount++;

  return [{
    agent: "flow-agent",
    content: data.content[0].text.trim(),
    isProactive: true,
    questionId: selectedQuestion.id
  }];
}

function analyzeUserBehavior(sessionState: SessionState) {
  const score = (
    sessionState.messageCount * 1 +
    sessionState.statementCount * 2 +
    sessionState.questionCount * 1.5
  ) / 10;
  
  return {
    engagementLevel: Math.min(10, score),
    hasStatements: sessionState.statementCount > 0,
    hasQuestions: sessionState.questionCount > 0,
    topicDiversity: sessionState.topicsEngaged.length,
  };
}

function selectBestQuestion(userBehavior: any, usedQuestionIds: string[]) {
  const availableQuestions = FACILITATION_QUESTIONS.filter(
    q => !usedQuestionIds.includes(q.id)
  );
  
  // Score questions based on user behavior
  const scored = availableQuestions.map(q => ({
    question: q,
    score: calculateQuestionRelevance(q, userBehavior)
  }));
  
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0.5 ? scored[0].question : null;
}

function calculateQuestionRelevance(question: any, userBehavior: any): number {
  let score = 0.5; // Base score
  
  // Adjust based on context match
  if (question.context === 'passive_reading' && !userBehavior.hasStatements) {
    score += 0.3;
  }
  if (question.context === 'no_statements_yet' && userBehavior.hasQuestions) {
    score += 0.2;
  }
  if (question.context === 'high_engagement' && userBehavior.engagementLevel > 5) {
    score += 0.3;
  }
  
  return Math.min(1, score);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message_id, user_id, content } = await req.json();
    
    console.log('AI Orchestrator processing message:', { message_id, user_id, content });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user session data and recent messages
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(20);

    // Initialize session state
    const sessionData = {
      messageCount: recentMessages?.length || 0,
      lastMessageTime: recentMessages?.[0]?.created_at ? new Date(recentMessages[0].created_at).getTime() : Date.now()
    };
    const sessionState = new SessionState(user_id, sessionData);

    // Check for proactive engagement (when no content provided)
    if (!content && shouldTriggerProactiveEngagement(sessionState)) {
      console.log('Triggering proactive engagement');
      const proactiveResponse = await handleProactiveEngagement({}, sessionState, anthropicKey);
      
      if (proactiveResponse.length > 0) {
        // Store proactive message
        const { error: insertError } = await supabase
          .from('messages')
          .insert({
            content: proactiveResponse[0].content,
            user_id: user_id,
            message_type: 'flow_agent',
            agent_context: { isProactive: true, questionId: proactiveResponse[0].questionId }
          });

        if (insertError) {
          console.error('Error storing proactive message:', insertError);
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          type: 'proactive_engagement',
          responses: proactiveResponse
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Classify the input
    const inputType = await classifyInput(content, anthropicKey);
    console.log('Input classified as:', inputType);

    // Update session state
    sessionState.updateActivity(inputType);

    // Determine agents to call based on input type
    let agentsToCall: string[] = [];
    
    switch(inputType) {
      case 'QUESTION':
        // Bill for knowledge, Peer for community perspective
        agentsToCall = ['bill-agent', 'peer-agent'];
        break;
        
      case 'STATEMENT':
        // Always get both supportive and counter perspectives
        agentsToCall = ['bill-agent', 'peer-agent'];
        break;
        
      default:
        // Single response from most relevant agent
        agentsToCall = ['bill-agent'];
    }

    console.log(`Calling agents for ${inputType}: ${agentsToCall.join(', ')}`);

    // Call the selected agents with enhanced context
    const agentPromises = agentsToCall.map(async (agentName) => {
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/${agentName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            message_id,
            content,
            user_id,
            input_type: inputType,
            session_state: {
              messageCount: sessionState.messageCount,
              statementCount: sessionState.statementCount,
              questionCount: sessionState.questionCount
            }
          })
        });

        if (!response.ok) {
          console.error(`Error calling ${agentName}:`, await response.text());
          return null;
        }

        const result = await response.json();
        console.log(`${agentName} response:`, result);
        return { agent: agentName, result };
      } catch (error) {
        console.error(`Error calling ${agentName}:`, error);
        return null;
      }
    });

    const results = await Promise.all(agentPromises);
    const successfulResults = results.filter(r => r !== null);

    return new Response(
      JSON.stringify({ 
        success: true,
        inputType,
        agentsCalled: agentsToCall,
        results: successfulResults,
        sessionState: {
          messageCount: sessionState.messageCount,
          engagementLevel: analyzeUserBehavior(sessionState).engagementLevel
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('AI Orchestrator error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});