import { PrismaClient } from '@prisma/client';
import { BillAgentService } from './bill-agent.service';
import { PeerAgentService } from './peer-agent.service';
import { AIService } from './ai.service';
import { logger } from '../utils/logger';
import { sendSSEMessage } from '../routes/sse';

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
  private billAgent: BillAgentService;
  private peerAgent: PeerAgentService;
  private aiService: AIService;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.billAgent = new BillAgentService(prisma);
    this.peerAgent = new PeerAgentService(prisma);
    this.aiService = new AIService();
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
      const safetyCheck = await this.aiService.checkContentSafety(content, traceId);
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
      const inputType = await this.aiService.classifyInput(content, traceId);
      
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
    const { userId, traceId } = context;

    try {
      if (agentType === 'bill_agent') {
        // Stream Bill Agent response
        const responseStream = this.billAgent.streamResponse(context);
        
        for await (const chunk of responseStream) {
          sendSSEMessage(userId, 'agent_response', {
            agent: 'bill_agent',
            content: chunk.content,
            done: chunk.done,
            confidence: chunk.confidence,
            relevance: chunk.relevance,
          });
        }
      } else if (agentType === 'peer_agent') {
        // Stream Peer Agent response
        const responseStream = this.peerAgent.streamResponse(context);
        
        for await (const chunk of responseStream) {
          sendSSEMessage(userId, 'agent_response', {
            agent: 'peer_agent',
            content: chunk.content,
            done: chunk.done,
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
  }): Promise<void> {
    const { content, userId, inputType, sessionState, traceId } = context;

    // Flow Agent provides conversation management and transitions
    const flowPrompt = `You are the Flow Agent, managing conversation flow and transitions in democratic deliberation.

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

    const response = await this.aiService.generateResponse(flowPrompt, undefined, { traceId });

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
}