import { PrismaClient } from '@prisma/client';
import { AIService } from './ai.service';
import { logger } from '../utils/logger';
import { DeliberationContext } from './agent-factory.service';

interface AgentContext {
  messageId?: string;
  content: string;
  userId: string;
  inputType?: 'QUESTION' | 'STATEMENT' | 'OTHER';
  sessionState?: any;
  traceId?: string;
  deliberationId?: string;
}

interface AgentResponse {
  content: string;
  confidence?: number;
  relevance?: number;
  sources?: string[];
  processingTime: number;
}

interface BillAgentOptions {
  deliberationContext: DeliberationContext;
  configuration?: any;
  aiService: AIService;
}

export class BillAgentService {
  private prisma: PrismaClient;
  private aiService: AIService;
  private deliberationContext: DeliberationContext;
  private configuration: any;

  constructor(prisma: PrismaClient, options?: BillAgentOptions) {
    this.prisma = prisma;
    
    if (options) {
      // New deliberation-scoped instance
      this.aiService = options.aiService;
      this.deliberationContext = options.deliberationContext;
      this.configuration = options.configuration;
    } else {
      // Legacy global instance for backward compatibility
      this.aiService = new AIService();
      this.deliberationContext = {
        id: 'global',
        title: 'Global Context',
      };
      this.configuration = null;
    }
  }

  async generateResponse(context: AgentContext): Promise<AgentResponse> {
    const startTime = Date.now();
    const { content, userId, inputType, sessionState, traceId, deliberationId } = context;

    try {
      // Use instance deliberation context
      const deliberationContext = this.getInstanceDeliberationContext();

      // Use instance configuration if available, otherwise fetch from database
      let agentConfig = this.configuration;
      
      if (!agentConfig) {
        agentConfig = await this.prisma.agentConfiguration.findFirst({
          where: {
            agentType: 'bill_agent',
            isDefault: true,
            isActive: true,
          },
        });
      }

      // Get recent conversation context
      const recentMessages = await this.prisma.message.findMany({
        where: { userId },
        select: { content: true, messageType: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      const conversationContext = recentMessages
        .reverse()
        .map(m => `[${m.messageType}]: ${m.content}`)
        .join('\n');

      // Search for relevant knowledge
      const knowledgeContext = await this.searchKnowledge(agentConfig?.id, content, traceId);

      // Build system prompt
      const defaultSystemPrompt = `You are the Bill Agent, a specialized AI facilitator for democratic deliberation using the IBIS (Issue-Based Information System) framework.

YOUR ROLE:
- Synthesize user input into clear IBIS Issues (core problems/questions)
- Identify and articulate different Positions (solutions/stances) 
- Extract Arguments (supporting/opposing evidence)
- Maintain a structured overview of the deliberation
- Help users explore and develop their ideas through thoughtful questions
- Use relevant knowledge from documents and sources to provide context and insights`;

      const systemPrompt = this.buildSystemPrompt(
        agentConfig?.systemPrompt || defaultSystemPrompt,
        inputType,
        sessionState
      );

      // Build the complete prompt
      const billAgentPrompt = this.buildPrompt({
        systemPrompt: finalSystemPrompt,
        goals: agentConfig?.goals,
        responseStyle: agentConfig?.responseStyle,
        conversationContext,
        knowledgeContext,
        deliberationContext,
        content,
        inputType,
        sessionState,
      });

      // Generate AI response
      const aiResponse = await this.aiService.generateResponse(
        billAgentPrompt,
        undefined,
        { traceId }
      );

      // Parse confidence and relevance scores if present
      const { cleanContent, confidence, relevance } = this.parseResponse(aiResponse.content);

      // Store the response
      await this.prisma.message.create({
        data: {
          content: cleanContent,
          messageType: 'bill_agent',
          userId,
          agentContext: {
            confidence,
            relevance,
            inputType,
            processingTime: Date.now() - startTime,
          },
        },
      });

      return {
        content: cleanContent,
        confidence,
        relevance,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      logger.error({ error, userId, traceId }, 'Bill Agent error');
      throw new Error(`Bill Agent failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async searchKnowledge(agentId: string | undefined, query: string, traceId?: string): Promise<string> {
    if (!agentId) return '';

    try {
      // Try to use Supabase function for semantic search first
      try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        if (supabaseUrl && supabaseKey) {
          const response = await fetch(`${supabaseUrl}/functions/v1/langchain-query-knowledge`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              query,
              agentId,
              maxResults: 3
            })
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.relevantKnowledge?.length > 0) {
              return `\n\nRELEVANT KNOWLEDGE:\n${data.relevantKnowledge.map((item: any, index: number) => 
                `[${index + 1}] ${item.title}: ${item.content.substring(0, 500)}...`
              ).join('\n\n')}\n\n`;
            }
          }
        }
      } catch (error) {
        logger.error({ error, traceId }, 'Supabase knowledge search failed, falling back to Prisma');
      }

      // Fallback to Prisma-based search
      const knowledgeItems = await this.prisma.agentKnowledge.findMany({
        where: { agentId },
        select: { title: true, content: true },
        take: 3,
      });

      if (knowledgeItems.length === 0) return '';

      // Simple keyword-based relevance for fallback
      const relevantItems = knowledgeItems
        .map((item) => {
          const queryLower = query.toLowerCase();
          const contentLower = item.content.toLowerCase();
          const titleLower = item.title.toLowerCase();
          
          const titleScore = titleLower.includes(queryLower) ? 1 : 0;
          const contentScore = contentLower.split(queryLower).length - 1;
          const relevance = (titleScore * 0.5) + (contentScore * 0.1);
          
          return { ...item, relevance };
        })
        .filter(item => item.relevance > 0)
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 3);

      if (relevantItems.length === 0) return '';

      return `\n\nRELEVANT KNOWLEDGE:\n${relevantItems.map((item, index) => 
        `[${index + 1}] ${item.title}: ${item.content.substring(0, 500)}...`
      ).join('\n\n')}\n\n`;
    } catch (error) {
      logger.error({ error, agentId, query, traceId }, 'Knowledge search failed');
      return '';
    }
  }

  private buildSystemPrompt(
    basePrompt: string,
    inputType?: string,
    sessionState?: any
  ): string {
    let systemPrompt = basePrompt;

    if (inputType === 'QUESTION') {
      systemPrompt += `

QUESTION HANDLING:
- Provide factual, balanced information
- Acknowledge multiple perspectives when relevant
- Base responses on verified information from knowledge base
- Keep responses informative but concise (2-3 paragraphs)
- End with confidence and relevance scores`;
    } else if (inputType === 'STATEMENT') {
      const responseType = sessionState?.statementCount % 2 === 0 ? 'supportive' : 'counter';
      systemPrompt += `

STATEMENT HANDLING:
- Analyze the stance and underlying arguments
- Provide a ${responseType} perspective
- Reference relevant knowledge from the knowledge base
- Maintain respectful and constructive tone
- Focus on substance and evidence`;
    }

    return systemPrompt;
  }

  private async getDeliberationContext(deliberationId?: string): Promise<string> {
    if (!deliberationId) return '';

    try {
      const deliberation = await this.prisma.deliberation.findUnique({
        where: { id: deliberationId },
        select: { title: true, description: true, notion: true },
      });

      if (!deliberation) return '';

      const context = [];
      context.push(`DELIBERATION TITLE: ${deliberation.title}`);
      
      if (deliberation.notion) {
        context.push(`DELIBERATION NOTION: ${deliberation.notion}`);
      }
      
      if (deliberation.description) {
        context.push(`DELIBERATION DESCRIPTION: ${deliberation.description}`);
      }

      return context.length > 1 ? `\n\nDELIBERATION CONTEXT:\n${context.join('\n')}\n\n` : '';
    } catch (error) {
      logger.error({ error, deliberationId }, 'Failed to fetch deliberation context');
    return '';
  }

  private getInstanceDeliberationContext(): string {
    if (!this.deliberationContext || this.deliberationContext.id === 'global') return '';
    
    const context = [];
    context.push(`DELIBERATION: ${this.deliberationContext.title}`);
    if (this.deliberationContext.notion) context.push(`NOTION: ${this.deliberationContext.notion}`);
    return context.length > 1 ? `\n${context.join(' | ')}\n` : '';
  }
}

  private buildPrompt(params: {
    systemPrompt: string;
    goals?: string[];
    responseStyle?: string;
    conversationContext: string;
    knowledgeContext: string;
    deliberationContext: string;
    content: string;
    inputType?: string;
    sessionState?: any;
  }): string {
    const {
      systemPrompt,
      goals,
      responseStyle,
      conversationContext,
      knowledgeContext,
      deliberationContext,
      content,
      inputType,
      sessionState,
    } = params;

    const goalsSection = goals?.length
      ? `GOALS:\n${goals.map(goal => `- ${goal}`).join('\n')}\n\n`
      : '';

    const styleSection = responseStyle
      ? `RESPONSE STYLE:\n${responseStyle}\n\n`
      : `RESPONSE STYLE:\n- Professional yet conversational\n- Focus on the structural aspects of the argument\n- Encourage deeper thinking\n- Keep responses concise (2-3 paragraphs max)\n- Reference relevant knowledge when helpful\n\n`;

    if (inputType === 'QUESTION') {
      return `${systemPrompt}

${goalsSection}${deliberationContext}CONVERSATION CONTEXT:
${conversationContext}
${knowledgeContext}
USER QUESTION: "${content}"

${styleSection}${knowledgeContext ? 'Use the relevant knowledge above to inform your response when appropriate. ' : ''}

Provide an informative response to this question. End with:
CONFIDENCE: [0-1 score indicating how confident you are in this response]
RELEVANCE: [0-1 score indicating how relevant this response is to the question]

Respond as the Bill Agent:`;
    } else if (inputType === 'STATEMENT') {
      const responseType = sessionState?.statementCount % 2 === 0 ? 'supportive' : 'counter';
      return `${systemPrompt}

${goalsSection}${deliberationContext}CONVERSATION CONTEXT:
${conversationContext}
${knowledgeContext}
USER STATEMENT: "${content}"

${styleSection}${knowledgeContext ? 'Use the relevant knowledge above to inform your response when appropriate. ' : ''}

Provide a ${responseType} response to this statement. ${
        responseType === 'supportive'
          ? 'Build upon their perspective with additional evidence or reasoning.'
          : 'Present alternative viewpoints or evidence that challenges this perspective.'
      } Keep the tone respectful and constructive.

Respond as the Bill Agent:`;
    } else {
      return `${systemPrompt}

${goalsSection}${deliberationContext}CONVERSATION CONTEXT:
${conversationContext}
${knowledgeContext}
NEW USER MESSAGE: "${content}"

${styleSection}${knowledgeContext ? 'Use the relevant knowledge above to inform your response when appropriate. ' : ''}Respond as the Bill Agent:`;
    }
  }

  private parseResponse(content: string): {
    cleanContent: string;
    confidence?: number;
    relevance?: number;
  } {
    const confidenceMatch = content.match(/CONFIDENCE:\s*([0-9.]+)/i);
    const relevanceMatch = content.match(/RELEVANCE:\s*([0-9.]+)/i);
    
    const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : undefined;
    const relevance = relevanceMatch ? parseFloat(relevanceMatch[1]) : undefined;
    
    const cleanContent = content
      .replace(/CONFIDENCE:\s*[0-9.]+/gi, '')
      .replace(/RELEVANCE:\s*[0-9.]+/gi, '')
      .trim();

    return { cleanContent, confidence, relevance };
  }

  // Stream response for real-time updates
  async *streamResponse(context: AgentContext): AsyncGenerator<{
    content: string;
    done: boolean;
    confidence?: number;
    relevance?: number;
  }, void, unknown> {
    // Similar to generateResponse but using streaming
    const { content, userId, inputType, sessionState, traceId, deliberationId } = context;

    try {
      // Use instance deliberation context
      const deliberationContext = this.getInstanceDeliberationContext();

      // Use instance configuration if available, otherwise fetch from database
      let agentConfig = this.configuration;
      
      if (!agentConfig) {
        agentConfig = await this.prisma.agentConfiguration.findFirst({
          where: {
            agentType: 'bill_agent',
            isDefault: true,
            isActive: true,
          },
        });
      }

      const recentMessages = await this.prisma.message.findMany({
        where: { userId },
        select: { content: true, messageType: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      const conversationContext = recentMessages
        .reverse()
        .map(m => `[${m.messageType}]: ${m.content}`)
        .join('\n');

      const knowledgeContext = await this.searchKnowledge(agentConfig?.id, content, traceId);

      const systemPrompt = this.buildSystemPrompt(
        agentConfig?.systemPrompt || '',
        inputType,
        sessionState
      );

      const prompt = this.buildPrompt({
        systemPrompt,
        goals: agentConfig?.goals,
        responseStyle: agentConfig?.responseStyle,
        conversationContext,
        knowledgeContext,
        deliberationContext,
        content,
        inputType,
        sessionState,
      });

      let fullContent = '';
      
      for await (const chunk of this.aiService.streamResponse(prompt, undefined, { traceId })) {
        fullContent += chunk.content;
        
        if (chunk.done) {
          const { cleanContent, confidence, relevance } = this.parseResponse(fullContent);
          
          // Store the complete response
          await this.prisma.message.create({
            data: {
              content: cleanContent,
              messageType: 'bill_agent',
              userId,
              agentContext: {
                confidence,
                relevance,
                inputType,
                streamed: true,
              },
            },
          });

          yield { content: '', done: true, confidence, relevance };
        } else {
          yield { content: chunk.content, done: false };
        }
      }
    } catch (error) {
      logger.error({ error, userId, traceId }, 'Bill Agent streaming error');
      throw error;
    }
  }

  private async getSystemPrompt(agentId?: string, agentType: string = 'bill_agent'): Promise<string> {
    try {
      // First check for agent-specific overrides if agentId provided
      if (agentId) {
        const agentConfig = await this.prisma.agentConfiguration.findUnique({
          where: { id: agentId },
          select: { promptOverrides: true }
        });

        if (agentConfig?.promptOverrides?.['system_prompt']) {
          return agentConfig.promptOverrides['system_prompt'];
        }
      }

      // Fall back to default prompt for agent type
      const defaultPrompt = await this.prisma.promptTemplate.findFirst({
        where: {
          promptType: 'system_prompt',
          agentType: agentType,
          isDefault: true,
          isActive: true
        },
        select: { template: true }
      });

      if (defaultPrompt?.template) {
        return defaultPrompt.template;
      }

      // Final fallback to hardcoded default
      return 'You are the Bill Agent, a specialized AI facilitator for democratic deliberation.';
    } catch (error) {
      logger.error({ error, agentId, agentType }, 'Failed to get system prompt');
      return 'You are the Bill Agent, a specialized AI facilitator for democratic deliberation.';
    }
  }
}