import { PrismaClient } from '@prisma/client';
import { BillAgentService } from './bill-agent.service';
import { PeerAgentService } from './peer-agent.service';
import { AIService } from './ai.service';
import { logger } from '../utils/logger';
import { sendSSEMessage } from '../routes/sse';
import { DeliberationAgentManager } from './deliberation-agent-manager.service';

interface SessionState {
  lastActivityTime: number;
  messageCount: number;
  statementCount: number;
  questionCount: number;
  topicsEngaged: string[];
  usedQuestionIds: string[];
  proactivePromptsCount: number;
  optedOutOfPrompts: boolean;
}

interface OrchestrationContext {
  messageId?: string;
  userId: string;
  content?: string;
  sessionState?: SessionState;
  traceId: string;
  deliberationId?: string;
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

export class AIOrchestrationService {
  private prisma: PrismaClient;
  private deliberationAgentManager: DeliberationAgentManager;
  private globalAiService: AIService; // For safety checks and non-deliberation operations

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.deliberationAgentManager = new DeliberationAgentManager(prisma);
    this.globalAiService = new AIService();
  }

  async processMessage(context: OrchestrationContext): Promise<void> {
    const { messageId, userId, content, sessionState, traceId, deliberationId } = context;

    try {
      if (!content) {
        // No content means proactive engagement check
        await this.handleProactiveEngagement(userId, sessionState, traceId);
        return;
      }

      // Check content safety first
      const safetyCheck = await this.globalAiService.checkContentSafety(content, traceId);
      if (!safetyCheck.safe) {
        logger.warn({ userId, content, reason: safetyCheck.reason, traceId }, 'Content blocked by safety check');
        
        await this.prisma.message.create({
          data: {
            content: `I cannot process that message as it appears to contain inappropriate content. ${safetyCheck.reason || ''} Please rephrase your message in a constructive way.`,
            messageType: 'flow_agent',
            userId,
            agentContext: {
              safetyBlock: true,
              reason: safetyCheck.reason,
            },
          },
        });

        // Send real-time update
        sendSSEMessage(userId, 'message', {
          type: 'safety_block',
          message: 'Message blocked for safety reasons',
        });

        return;
      }

      // Classify input type
      const inputType = await this.globalAiService.classifyInput(content, traceId);
      
      logger.info({ userId, inputType, messageLength: content.length, traceId }, 'Input classified');

      // Determine which agents should respond
      const agentResponses = await this.determineAgentResponses(inputType, sessionState);

      // Execute agent responses in parallel with streaming
      const agentPromises = agentResponses.map(async (agentType) => {
        return this.executeAgentResponse(agentType, {
          messageId,
          content,
          userId,
          inputType,
          sessionState,
          traceId,
          deliberationId,
        });
      });

      await Promise.all(agentPromises);

      logger.info({ 
        userId, 
        agentsExecuted: agentResponses, 
        traceId 
      }, 'Message processing completed');

    } catch (error) {
      logger.error({ error, userId, traceId }, 'Orchestration error');
      
      // Send error message to user
      await this.prisma.message.create({
        data: {
          content: "I'm sorry, I encountered an error processing your message. Please try again.",
          messageType: 'flow_agent',
          userId,
          agentContext: {
            error: true,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
          },
        },
      });

      throw error;
    }
  }

  private async determineAgentResponses(
    inputType: string,
    sessionState?: SessionState
  ): Promise<string[]> {
    const agents = [];

    // Always include Bill Agent for primary response
    agents.push('bill_agent');

    // Include Peer Agent based on input type and session state
    if (inputType === 'STATEMENT' || (sessionState && sessionState.messageCount > 3)) {
      agents.push('peer_agent');
    }

    // Randomly include Flow Agent for conversation management (20% chance)
    if (Math.random() < 0.2 && sessionState && sessionState.messageCount > 5) {
      agents.push('flow_agent');
    }

    return agents;
  }

  private async executeAgentResponse(
    agentType: string,
    context: {
      messageId?: string;
      content: string;
      userId: string;
      inputType: string;
      sessionState?: SessionState;
      traceId: string;
      deliberationId?: string;
    }
  ): Promise<void> {
    const { userId, traceId, deliberationId } = context;

    try {
      if (agentType === 'bill_agent') {
        // Get deliberation-scoped agents
        const agents = deliberationId 
          ? await this.deliberationAgentManager.getAgentsForDeliberation(deliberationId)
          : null;

        const billAgent = agents ? agents.billAgent : new BillAgentService(this.prisma);
        
        try {
          // Stream Bill Agent response
          const responseStream = billAgent.streamResponse(context);
          
          for await (const chunk of responseStream) {
            sendSSEMessage(userId, 'agent_response', {
              agent: 'bill_agent',
              content: chunk.content,
              done: chunk.done,
              confidence: chunk.confidence,
              relevance: chunk.relevance,
            });
          }
        } catch (streamError) {
          logger.error({ error: streamError, userId, agentType, traceId }, 'Agent streaming failed, falling back to simple response');
          
          // Fallback to simple response generation
          const response = await billAgent.generateResponse(context);
          sendSSEMessage(userId, 'agent_response', {
            agent: 'bill_agent',
            content: response.content,
            done: true,
            confidence: response.confidence,
            relevance: response.relevance,
          });
        }
      } else if (agentType === 'peer_agent') {
        // Get deliberation-scoped agents
        const agents = deliberationId 
          ? await this.deliberationAgentManager.getAgentsForDeliberation(deliberationId)
          : null;

        const peerAgent = agents ? agents.peerAgent : new PeerAgentService(this.prisma);
        
        try {
          // Stream Peer Agent response
          const responseStream = peerAgent.streamResponse(context);
          
          for await (const chunk of responseStream) {
            sendSSEMessage(userId, 'agent_response', {
              agent: 'peer_agent',
              content: chunk.content,
              done: chunk.done,
              confidence: chunk.confidence,
              relevance: chunk.relevance,
            });
          }
        } catch (streamError) {
          logger.error({ error: streamError, userId, agentType, traceId }, 'Agent streaming failed, falling back to simple response');
          
          // Fallback to simple response generation
          const response = await peerAgent.generateResponse(context);
          sendSSEMessage(userId, 'agent_response', {
            agent: 'peer_agent',
            content: response.content,
            done: true,
            confidence: response.confidence,
            relevance: response.relevance,
          });
        }
      } else if (agentType === 'flow_agent') {
        // Flow Agent provides conversation management
        await this.executeFlowAgent(context);
      }
    } catch (error) {
      logger.error({ error, agentType, userId, traceId }, 'Agent execution error');
      
      // Send error response for this specific agent
      sendSSEMessage(userId, 'agent_error', {
        agent: agentType,
        error: 'Agent temporarily unavailable',
      });
    }
  }

  private async executeFlowAgent(context: {
    content: string;
    userId: string;
    inputType: string;
    sessionState?: SessionState;
    traceId: string;
    deliberationId?: string;
  }): Promise<void> {
    const { content, userId, inputType, sessionState, traceId, deliberationId } = context;

    // Get deliberation context
    let deliberationContext = '';
    if (deliberationId) {
      try {
        const deliberation = await this.prisma.deliberation.findUnique({
          where: { id: deliberationId },
          select: { title: true, description: true, notion: true },
        });
        if (deliberation) {
          const context = [];
          context.push(`DELIBERATION: ${deliberation.title}`);
          if (deliberation.notion) context.push(`NOTION: ${deliberation.notion}`);
          deliberationContext = context.length > 1 ? `\n${context.join(' | ')}\n` : '';
        }
      } catch (error) {
        logger.error({ error, deliberationId }, 'Failed to fetch deliberation context for flow agent');
      }
    }

    // Get flow agent configuration with facilitator settings
    const flowAgentConfig = await this.prisma.agentConfiguration.findFirst({
      where: { 
        agentType: 'flow_agent',
        isActive: true,
        isDefault: true
      },
    });

    // Get or create facilitator session to track prompting state
    let facilitatorSession = await this.prisma.facilitatorSession.findFirst({
      where: {
        userId,
        deliberationId,
        agentConfigId: flowAgentConfig?.id,
      },
    });

    if (!facilitatorSession && flowAgentConfig) {
      facilitatorSession = await this.prisma.facilitatorSession.create({
        data: {
          userId,
          deliberationId,
          agentConfigId: flowAgentConfig.id,
          lastActivityTime: new Date(),
        },
      });
    }

    // Check if we should send a facilitator prompt based on configuration
    const facilitatorConfig = flowAgentConfig?.facilitatorConfig as any;
    const shouldSendPrompt = await this.shouldSendFacilitatorPrompt(
      facilitatorSession,
      facilitatorConfig,
      sessionState
    );

    let flowPrompt: string;
    
    if (shouldSendPrompt) {
      // Select an appropriate prompting question
      const selectedQuestion = this.selectFacilitatorQuestion(
        facilitatorConfig?.prompting_questions || [],
        sessionState,
        facilitatorSession?.sessionState as any
      );
      
      if (selectedQuestion) {
        flowPrompt = `You are the Flow Agent acting as a facilitator in democratic deliberation.
${deliberationContext}
FACILITATION CONTEXT:
- User input type: ${inputType}
- Session message count: ${sessionState?.messageCount || 0}
- Recent statement count: ${sessionState?.statementCount || 0}

USER MESSAGE: "${content}"

Your role is to facilitate engagement. Use this prompting question to encourage participation:
"${selectedQuestion.text}"

Provide a response that:
- Briefly acknowledges their contribution
- Naturally incorporates the prompting question
- Encourages deeper engagement
- Maintains conversational flow

Keep response conversational and under 3 sentences.`;

        // Update facilitator session
        if (facilitatorSession) {
          await this.prisma.facilitatorSession.update({
            where: { id: facilitatorSession.id },
            data: {
              lastPromptTime: new Date(),
              promptsSentCount: (facilitatorSession.promptsSentCount || 0) + 1,
              lastActivityTime: new Date(),
              sessionState: {
                ...facilitatorSession.sessionState as any,
                usedQuestionIds: [
                  ...((facilitatorSession.sessionState as any)?.usedQuestionIds || []),
                  selectedQuestion.id
                ]
              }
            },
          });
        }
      } else {
        // Default flow agent response
        flowPrompt = this.getDefaultFlowPrompt(deliberationContext, inputType, sessionState, content);
      }
    } else {
      // Default flow agent response
      flowPrompt = this.getDefaultFlowPrompt(deliberationContext, inputType, sessionState, content);
      
      // Update last activity time
      if (facilitatorSession) {
        await this.prisma.facilitatorSession.update({
          where: { id: facilitatorSession.id },
          data: {
            lastActivityTime: new Date(),
          },
        });
      }
    }

    const response = await this.globalAiService.generateResponse(flowPrompt, undefined, { traceId }, context.userId, context.deliberationId);

    await this.prisma.message.create({
      data: {
        content: response.content,
        messageType: 'flow_agent',
        userId,
        agentContext: {
          inputType,
          sessionState,
          role: 'flow_management',
        },
      },
    });

    // Send real-time update
    sendSSEMessage(userId, 'agent_response', {
      agent: 'flow_agent',
      content: response.content,
      done: true,
    });
  }

  private async handleProactiveEngagement(
    userId: string,
    sessionState?: SessionState,
    traceId?: string
  ): Promise<void> {
    if (!sessionState || sessionState.optedOutOfPrompts) {
      return;
    }

    // Check if user needs proactive engagement
    const userBehavior = await this.analyzeUserBehavior(userId);
    const selectedQuestion = this.selectProactiveQuestion(userBehavior, sessionState);

    if (selectedQuestion) {
      logger.info({ userId, questionId: selectedQuestion.id, traceId }, 'Sending proactive prompt');

      // Send proactive prompt via SSE
      sendSSEMessage(userId, 'proactive_prompt', {
        question: selectedQuestion.question,
        context: selectedQuestion.context,
        questionId: selectedQuestion.id,
      });

      // Track that we sent a proactive prompt
      await this.prisma.message.create({
        data: {
          content: `[Proactive Engagement] ${selectedQuestion.question}`,
          messageType: 'flow_agent',
          userId,
          agentContext: {
            isProactive: true,
            questionId: selectedQuestion.id,
            context: selectedQuestion.context,
          },
        },
      });
    }
  }

  private async analyzeUserBehavior(userId: string): Promise<{
    messageCount: number;
    statementCount: number;
    questionCount: number;
    lastMessageTime: Date | null;
    engagementLevel: number;
  }> {
    const userMessages = await this.prisma.message.findMany({
      where: { userId, messageType: 'user' },
      select: { messageType: true, content: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const statementCount = userMessages.filter(m => 
      m.content.length > 20 && !m.content.endsWith('?')
    ).length;

    const questionCount = userMessages.filter(m => 
      m.content.endsWith('?')
    ).length;

    const lastMessageTime = userMessages[0]?.createdAt || null;
    const engagementLevel = Math.min(10, userMessages.length * 0.5 + statementCount);

    return {
      messageCount: userMessages.length,
      statementCount,
      questionCount,
      lastMessageTime,
      engagementLevel,
    };
  }

  private selectProactiveQuestion(
    userBehavior: any,
    sessionState: SessionState
  ): typeof FACILITATION_QUESTIONS[0] | null {
    // Filter out already used questions
    const availableQuestions = FACILITATION_QUESTIONS.filter(
      q => !sessionState.usedQuestionIds.includes(q.id)
    );

    if (availableQuestions.length === 0) {
      return null; // All questions used
    }

    // Select question based on context
    for (const question of availableQuestions) {
      const score = this.calculateQuestionRelevance(question, userBehavior, sessionState);
      if (score > 0.7) {
        return question;
      }
    }

    return null;
  }

  private calculateQuestionRelevance(
    question: typeof FACILITATION_QUESTIONS[0],
    userBehavior: any,
    sessionState: SessionState
  ): number {
    let score = 0.5; // Base score

    // Context-specific scoring
    if (question.context === 'passive_reading' && userBehavior.messageCount < 3) {
      score += 0.3;
    }
    if (question.context === 'no_statements_yet' && sessionState.statementCount === 0) {
      score += 0.4;
    }
    if (question.context === 'high_engagement' && userBehavior.engagementLevel > 5) {
      score += 0.3;
    }

    return Math.min(1, score);
  }

  private async shouldSendFacilitatorPrompt(
    facilitatorSession: any,
    facilitatorConfig: any,
    sessionState?: SessionState
  ): Promise<boolean> {
    if (!facilitatorConfig?.prompting_enabled || !facilitatorSession) {
      return false;
    }

    const intervalMinutes = facilitatorConfig.prompting_interval_minutes || 3;
    const maxPromptsPerSession = facilitatorConfig.max_prompts_per_session || 5;
    
    // Check if we've exceeded max prompts for this session
    if ((facilitatorSession.promptsSentCount || 0) >= maxPromptsPerSession) {
      return false;
    }

    // Check if enough time has passed since last prompt
    if (facilitatorSession.lastPromptTime) {
      const timeSinceLastPrompt = Date.now() - new Date(facilitatorSession.lastPromptTime).getTime();
      const intervalMs = intervalMinutes * 60 * 1000;
      
      if (timeSinceLastPrompt < intervalMs) {
        return false;
      }
    }

    // Check if enough time has passed since last activity
    if (facilitatorSession.lastActivityTime) {
      const timeSinceLastActivity = Date.now() - new Date(facilitatorSession.lastActivityTime).getTime();
      const intervalMs = intervalMinutes * 60 * 1000;
      
      // Only prompt if user has been inactive for the interval duration
      return timeSinceLastActivity >= intervalMs;
    }

    return true;
  }

  private selectFacilitatorQuestion(
    questions: any[],
    sessionState?: SessionState,
    facilitatorSessionState?: any
  ): any | null {
    if (!questions || questions.length === 0) {
      return null;
    }

    // Filter out already used questions
    const usedQuestionIds = facilitatorSessionState?.usedQuestionIds || [];
    const availableQuestions = questions.filter(
      q => !usedQuestionIds.includes(q.id)
    );

    if (availableQuestions.length === 0) {
      return null; // All questions used
    }

    // Select question based on category weighting and relevance
    const weightedQuestions = availableQuestions.map(q => ({
      ...q,
      relevanceScore: this.calculateFacilitatorQuestionRelevance(q, sessionState)
    }));

    // Sort by relevance score and weight
    weightedQuestions.sort((a, b) => 
      (b.relevanceScore * (b.weight || 1.0)) - (a.relevanceScore * (a.weight || 1.0))
    );

    return weightedQuestions[0] || null;
  }

  private calculateFacilitatorQuestionRelevance(
    question: any,
    sessionState?: SessionState
  ): number {
    let score = 0.5; // Base score

    if (!sessionState) {
      return score;
    }

    // Category-specific scoring
    switch (question.category) {
      case 'exploration':
        if (sessionState.messageCount >= 2 && sessionState.statementCount === 0) {
          score += 0.4;
        }
        break;
      case 'perspective':
        if (sessionState.statementCount > 0 && sessionState.messageCount >= 3) {
          score += 0.3;
        }
        break;
      case 'clarification':
        if (sessionState.questionCount === 0 && sessionState.messageCount >= 2) {
          score += 0.3;
        }
        break;
      case 'synthesis':
        if (sessionState.messageCount >= 5 && sessionState.statementCount >= 2) {
          score += 0.4;
        }
        break;
      case 'action':
        if (sessionState.messageCount >= 7) {
          score += 0.3;
        }
        break;
    }

    return Math.min(1, score);
  }

  private getDefaultFlowPrompt(
    deliberationContext: string,
    inputType: string,
    sessionState?: SessionState,
    content?: string
  ): string {
    return `You are the Flow Agent, managing conversation flow and transitions in democratic deliberation.
${deliberationContext}
CURRENT CONTEXT:
- User input type: ${inputType}
- Session message count: ${sessionState?.messageCount || 0}
- Recent statement count: ${sessionState?.statementCount || 0}

USER MESSAGE: "${content}"

Provide a brief transitional response that:
- Acknowledges the user's contribution
- Suggests next steps or deeper exploration
- Encourages continued engagement
- Keeps the conversation flowing naturally

Keep response under 2 sentences and focus on facilitation, not content.`;
  }

  // Cleanup methods for resource management
  async cleanupDeliberationAgents(deliberationId: string): Promise<void> {
    await this.deliberationAgentManager.cleanupAgentsForDeliberation(deliberationId);
  }

  async cleanupAllAgents(): Promise<void> {
    await this.deliberationAgentManager.cleanupAllAgents();
  }

  getActiveDeliberations(): string[] {
    return this.deliberationAgentManager.getActiveDeliberations();
  }

  getAgentCount(): number {
    return this.deliberationAgentManager.getAgentCount();
  }
}