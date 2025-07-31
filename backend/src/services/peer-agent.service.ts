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
  processingTime: number;
  sources?: string[];
}

interface PeerAgentOptions {
  deliberationContext: DeliberationContext;
  configuration?: any;
  aiService: AIService;
}

export class PeerAgentService {
  private prisma: PrismaClient;
  private aiService: AIService;
  private deliberationContext: DeliberationContext;
  private configuration: any;

  constructor(prisma: PrismaClient, options?: PeerAgentOptions) {
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
            agentType: 'peer_agent',
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

      // Get peer perspectives from other users
      const peerStatements = await this.getPeerStatements(userId);
      const relevantPeerPerspectives = await this.findRelevantPeerPerspectives(content, peerStatements, traceId);

      // Get IBIS knowledge context
      const ibisNodes = await this.getIbisNodes(userId);
      const ibisContext = this.buildIbisContext(ibisNodes);
      const peerContext = this.buildPeerContext(relevantPeerPerspectives);

      // Build system prompt
      const defaultSystemPrompt = `You are the Peer Agent, representing diverse perspectives and alternative viewpoints in democratic deliberation.

YOUR ROLE:
- Present thoughtful counterpoints and alternative perspectives
- Ask challenging but constructive questions
- Help explore the full spectrum of an issue
- Encourage critical thinking and deeper analysis
- Represent voices that might not otherwise be heard`;

      const systemPrompt = this.buildSystemPrompt(
        agentConfig?.systemPrompt || defaultSystemPrompt,
        inputType,
        sessionState
      );

      // Build the complete prompt
      const peerAgentPrompt = this.buildPrompt({
        systemPrompt,
        goals: agentConfig?.goals,
        responseStyle: agentConfig?.responseStyle,
        conversationContext,
        knowledgeContext: ibisContext + peerContext,
        deliberationContext,
        content,
        inputType,
        sessionState,
      });

      // Generate AI response
      const aiResponse = await this.aiService.generateResponse(
        peerAgentPrompt,
        undefined,
        { traceId }
      );

      // Store the response
      await this.prisma.message.create({
        data: {
          content: aiResponse.content,
          messageType: 'peer_agent',
          userId,
          agentContext: {
            inputType,
            processingTime: Date.now() - startTime,
            peerPerspectivesUsed: relevantPeerPerspectives.length,
            ibisNodesUsed: ibisNodes.length,
          },
        },
      });

      return {
        content: aiResponse.content,
        processingTime: Date.now() - startTime,
        sources: relevantPeerPerspectives.map(p => p.content.substring(0, 100) + '...'),
      };
    } catch (error) {
      logger.error({ error, userId, traceId }, 'Peer Agent error');
      throw new Error(`Peer Agent failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async getPeerStatements(userId: string): Promise<any[]> {
    const statements = await this.prisma.message.findMany({
      where: {
        messageType: 'user',
        userId: { not: userId },
      },
      select: { content: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return statements;
  }

  private async findRelevantPeerPerspectives(
    query: string,
    peerStatements: any[],
    traceId?: string
  ): Promise<any[]> {
    if (!peerStatements || peerStatements.length === 0) return [];

    try {
      // Calculate relevance for each statement (limit to 10 for performance)
      const relevancePromises = peerStatements.slice(0, 10).map(async (statement) => {
        const relevance = await this.aiService.calculateRelevance(query, statement.content, traceId);
        return { ...statement, relevance };
      });

      const scoredStatements = await Promise.all(relevancePromises);
      
      return scoredStatements
        .filter(s => s.relevance > 0.7)
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 2);
    } catch (error) {
      logger.error({ error, query, traceId }, 'Error finding relevant peer perspectives');
      return [];
    }
  }

  private async getIbisNodes(userId: string): Promise<any[]> {
    const nodes = await this.prisma.ibisNode.findMany({
      where: {
        createdBy: userId,
      },
      select: {
        title: true,
        description: true,
        nodeType: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return nodes;
  }

  private buildIbisContext(ibisNodes: any[]): string {
    if (!ibisNodes.length) return '';

    return `PREVIOUS STATEMENTS AND ARGUMENTS FROM IBIS KNOWLEDGE BASE:
${ibisNodes.map(node => `[${node.nodeType.toUpperCase()}] ${node.title}: ${node.description}`).join('\n\n')}

`;
  }

  private buildPeerContext(relevantPeerPerspectives: any[]): string {
    if (!relevantPeerPerspectives.length) return '';

    return `RELEVANT PEER PERSPECTIVES:
${relevantPeerPerspectives.map((p, i) => `Perspective ${i + 1}: ${p.content}`).join('\n\n')}

`;
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
- Provide community perspectives on the question
- Reference how others in the community have approached similar questions
- Offer alternative angles to consider
- Keep responses conversational and engaging`;
    } else if (inputType === 'STATEMENT') {
      const responseType = sessionState?.statementCount % 2 === 1 ? 'supportive' : 'counter';
      systemPrompt += `

STATEMENT HANDLING:
- Provide a ${responseType} perspective to the user's statement
- ${responseType === 'supportive' 
  ? 'Build upon their viewpoint with community support' 
  : 'Present respectful alternative viewpoints from the community'}
- Reference relevant peer perspectives when available
- Maintain constructive dialogue`;
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
      : `RESPONSE STYLE:\n- Thoughtful and challenging\n- Present alternative viewpoints respectfully\n- Ask probing questions\n- Keep responses concise (2-3 paragraphs max)\n\n`;

    if (inputType === 'QUESTION') {
      return `${systemPrompt}

${goalsSection}${deliberationContext}${knowledgeContext}RECENT CONVERSATION CONTEXT:
${conversationContext}

USER QUESTION: "${content}"

${styleSection}Provide a community perspective on this question. ${knowledgeContext ? 'Reference the relevant peer perspectives above when helpful. ' : ''}Frame your response as representing diverse viewpoints from the community.

Respond as the Peer Agent:`;
    } else if (inputType === 'STATEMENT') {
      const responseType = sessionState?.statementCount % 2 === 1 ? 'supportive' : 'counter';
      return `${systemPrompt}

${goalsSection}${deliberationContext}${knowledgeContext}RECENT CONVERSATION CONTEXT:
${conversationContext}

USER STATEMENT: "${content}"

${styleSection}Provide a ${responseType} perspective from the community. ${knowledgeContext ? 'Use the relevant peer perspectives above to inform your response. ' : ''} ${
        responseType === 'supportive'
          ? 'Show how others in the community share similar views.'
          : 'Present alternative viewpoints that others in the community might hold.'
      } Frame as: "Another participant shared a similar perspective:" or "Another participant offered this alternative view:"

Respond as the Peer Agent:`;
    } else {
      return `${systemPrompt}

${goalsSection}${deliberationContext}${knowledgeContext}RECENT CONVERSATION CONTEXT:
${conversationContext}

NEW USER MESSAGE: "${content}"

${styleSection}Use the IBIS knowledge base and peer perspectives to provide informed responses that build upon previous statements and arguments. Reference specific points when relevant and offer thoughtful counterpoints or alternative perspectives.

Respond as the Peer Agent:`;
    }
  }

  // Stream response for real-time updates
  async *streamResponse(context: AgentContext): AsyncGenerator<{
    content: string;
    done: boolean;
  }, void, unknown> {
    const { content, userId, inputType, sessionState, traceId, deliberationId } = context;

    try {
      // Use instance deliberation context
      const deliberationContext = this.getInstanceDeliberationContext();

      // Use instance configuration if available, otherwise fetch from database
      let agentConfig = this.configuration;
      
      if (!agentConfig) {
        agentConfig = await this.prisma.agentConfiguration.findFirst({
          where: {
            agentType: 'peer_agent',
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

      const peerStatements = await this.getPeerStatements(userId);
      const relevantPeerPerspectives = await this.findRelevantPeerPerspectives(content, peerStatements, traceId);
      const ibisNodes = await this.getIbisNodes(userId);
      const ibisContext = this.buildIbisContext(ibisNodes);
      const peerContext = this.buildPeerContext(relevantPeerPerspectives);

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
        knowledgeContext: ibisContext + peerContext,
        deliberationContext,
        content,
        inputType,
        sessionState,
      });

      let fullContent = '';
      
      for await (const chunk of this.aiService.streamResponse(prompt, undefined, { traceId })) {
        fullContent += chunk.content;
        
        if (chunk.done) {
          // Store the complete response
          await this.prisma.message.create({
            data: {
              content: fullContent,
              messageType: 'peer_agent',
              userId,
              agentContext: {
                inputType,
                streamed: true,
                peerPerspectivesUsed: relevantPeerPerspectives.length,
                ibisNodesUsed: ibisNodes.length,
              },
            },
          });

          yield { content: '', done: true };
        } else {
          yield { content: chunk.content, done: false };
        }
      }
    } catch (error) {
      logger.error({ error, userId, traceId }, 'Peer Agent streaming error');
      throw error;
    }
  }
}