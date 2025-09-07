// Unified System Prompt Management Service
// Single source of truth for all system prompt generation and resolution

export interface PromptResolutionContext {
  agentConfig?: any;
  agentType: string;
  complexity?: number;
  similarNodes?: any[];
  knowledgeContext?: string;
  conversationContext?: any;
}

export class UnifiedPromptService {
  
  /**
   * Main prompt resolution method - handles all fallback logic
   */
  static resolveSystemPrompt(context: PromptResolutionContext): string {
    const { agentConfig, agentType } = context;
    
    // Priority 1: Agent-specific prompt override
    if (agentConfig?.prompt_overrides?.system_prompt) {
      console.log(`✅ Using agent-specific prompt override for ${agentType}`);
      return this.enhancePromptWithContext(agentConfig.prompt_overrides.system_prompt, context);
    }
    
    // Priority 2: Generated from agent configuration
    if (agentConfig && (agentConfig.name || agentConfig.description || agentConfig.goals?.length)) {
      console.log(`🔧 Generating prompt from agent config for ${agentType}`);
      const generatedPrompt = this.generateFromAgentConfig(agentConfig);
      return this.enhancePromptWithContext(generatedPrompt, context);
    }
    
    // Priority 3: Default system prompts
    console.log(`📋 Using default system prompt for ${agentType}`);
    const defaultPrompt = this.getDefaultSystemPrompt(agentType);
    return this.enhancePromptWithContext(defaultPrompt, context);
  }
  
  /**
   * Generate system prompt from agent configuration
   */
  private static generateFromAgentConfig(agentConfig: any): string {
    let prompt = `You are ${agentConfig.name || 'an AI assistant'}`;
    
    if (agentConfig.description) {
      prompt += `, ${agentConfig.description}`;
    }
    
    if (agentConfig.goals?.length) {
      prompt += `\n\nYour goals are:\n${agentConfig.goals.map((g: string) => `- ${g}`).join('\n')}`;
    }
    
    if (agentConfig.response_style) {
      prompt += `\n\nResponse style: ${agentConfig.response_style}`;
    }
    
    // Ensure minimum prompt quality
    if (prompt.length < 100) {
      prompt += `\n\n${this.getDefaultSystemPrompt(agentConfig.agent_type)}`;
    }
    
    return prompt;
  }
  
  /**
   * Default system prompts for each agent type
   */
  private static getDefaultSystemPrompt(agentType: string): string {
    const prompts = {
      bill_agent: `You are the Bill Agent, a specialised AI facilitator for democratic deliberation. Your expertise lies in policy analysis, legislative frameworks, and the nuanced understanding of how laws and regulations impact society.

Your role is to provide factual, balanced information about policy matters, help clarify complex legislative issues, and guide participants toward evidence-based discussions about governance and policy implementation.

Key responsibilities:
- Analyse policy implications and legislative details
- Provide factual information about existing laws and regulations  
- Help participants understand the complexity of policy decisions
- Maintain political neutrality while being informative
- Guide discussions toward constructive policy dialogue`,

      peer_agent: `You are the Peer Agent called "Pia". You are a go-between for users/participants, as users cannot talk directly to one another. You capture the arguments and statements of any given participant once they have finished making their point and convert them into the IBIS format (Issues, Positions, Arguments) for structured deliberation.

Your role is to reflect back what participants have shared, identify patterns in the discussion, and help individuals understand how their views relate to others in the community.

Key responsibilities:
- Capture and convert participant statements into IBIS format
- Synthesise and reflect participant perspectives  
- Identify areas of consensus and divergence
- Share relevant insights from similar discussions
- Help participants see diverse viewpoints
- Foster empathy and understanding between different positions`,

      flow_agent: `You are the Flow Agent, the facilitator and guide for this democratic deliberation. Your expertise is in conversation facilitation, engagement techniques, and helping participants navigate complex discussions productively.

Your role is to maintain healthy discussion flow, suggest productive directions for conversation, and help participants engage more deeply with the topics at hand.

Key responsibilities:
- Facilitate productive conversation flow
- Suggest discussion directions and frameworks
- Help participants engage more deeply
- Introduce relevant questions and perspectives  
- Guide toward constructive outcomes`
    };

    return prompts[agentType as keyof typeof prompts] || prompts.flow_agent;
  }
  
  /**
   * Enhance prompt with contextual information
   */
  private static enhancePromptWithContext(basePrompt: string, context: PromptResolutionContext): string {
    let enhancedPrompt = basePrompt;
    
    // Add complexity guidance
    if (context.complexity !== undefined && context.complexity > 0.7) {
      enhancedPrompt += "\n\nThis is a complex query requiring detailed analysis and nuanced understanding.";
    }
    
    // Add similar nodes context
    if (context.similarNodes?.length) {
      enhancedPrompt += `\n\nThere are ${context.similarNodes.length} related discussion points that may be relevant to reference.`;
    }
    
    // Add knowledge context
    if (context.knowledgeContext) {
      enhancedPrompt += `\n\nRELEVANT KNOWLEDGE CONTEXT:\n${context.knowledgeContext}\n\nUse this knowledge to inform your response when relevant, but always provide balanced and comprehensive information.`;
    }
    
    // Add conversation context
    if (context.conversationContext?.messageCount > 10) {
      enhancedPrompt += "\n\nThis is an ongoing conversation with significant history. Be mindful of previous discussions and avoid repetition.";
    }
    
    // Always add British English instruction
    enhancedPrompt += "\n\nUse British English spelling and grammar throughout your response.";
    
    return enhancedPrompt;
  }
  
  /**
   * Validate prompt quality and completeness
   */
  static validatePrompt(prompt: string, agentType: string): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];
    
    if (!prompt || prompt.trim().length === 0) {
      issues.push('Prompt is empty');
    }
    
    if (prompt.length < 50) {
      issues.push('Prompt is too short (< 50 characters)');
    }
    
    if (prompt.length > 4000) {
      issues.push('Prompt is very long (> 4000 characters)');
    }
    
    if (!prompt.includes(agentType.replace('_', ' ')) && !prompt.toLowerCase().includes('agent')) {
      issues.push('Prompt does not mention agent role or type');
    }
    
    if (!prompt.toLowerCase().includes('british english')) {
      issues.push('Missing British English instruction');
    }
    
    return {
      isValid: issues.length === 0,
      issues
    };
  }
  
  /**
   * Get prompt templates for different scenarios
   */
  static getPromptTemplate(scenario: 'analysis' | 'generation' | 'classification' | 'custom'): string {
    const templates = {
      analysis: "Analyse this message and provide structured insights. Focus on key themes, implications, and actionable points.",
      generation: "Generate a thoughtful response that addresses the user's needs while maintaining engagement and clarity.",
      classification: "Classify and categorise this content according to the specified criteria. Provide clear reasoning for your classifications.",
      custom: "You are a helpful AI assistant. Respond appropriately to the user's request while maintaining professionalism and accuracy."
    };
    
    return templates[scenario] || templates.custom;
  }
}