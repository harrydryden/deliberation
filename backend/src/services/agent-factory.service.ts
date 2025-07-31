import { PrismaClient } from '@prisma/client';
import { BillAgentService } from './bill-agent.service';
import { PeerAgentService } from './peer-agent.service';
import { AIService } from './ai.service';

export interface DeliberationContext {
  id: string;
  title: string;
  description?: string;
  notion?: string;
  facilitatorId?: string;
}

export interface AgentInstances {
  billAgent: BillAgentService;
  peerAgent: PeerAgentService;
  aiService: AIService;
}

export class AgentFactory {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createAgentsForDeliberation(deliberationContext: DeliberationContext): Promise<AgentInstances> {
    // Get deliberation-specific configurations
    const agentConfigs = await this.getDeliberationAgentConfigs(deliberationContext.id);
    
    // Create AI service instance
    const aiService = new AIService();

    // Create agent instances with deliberation context
    const billAgent = new BillAgentService(this.prisma, {
      deliberationContext,
      configuration: agentConfigs.billAgent,
      aiService,
    });

    const peerAgent = new PeerAgentService(this.prisma, {
      deliberationContext,
      configuration: agentConfigs.peerAgent,
      aiService,
    });

    return {
      billAgent,
      peerAgent,
      aiService,
    };
  }

  private async getDeliberationAgentConfigs(deliberationId: string) {
    // Get deliberation-specific configurations, fall back to defaults
    const configs = await this.prisma.agentConfiguration.findMany({
      where: {
        OR: [
          { deliberationId, isActive: true },
          { deliberationId: null, isDefault: true, isActive: true }
        ]
      },
      orderBy: [
        { deliberationId: 'desc' }, // Deliberation-specific configs take priority
        { isDefault: 'desc' }
      ]
    });

    // Group by agent type, prioritizing deliberation-specific configs
    const configsByType = new Map();
    for (const config of configs) {
      if (!configsByType.has(config.agentType)) {
        configsByType.set(config.agentType, config);
      }
    }

    return {
      billAgent: configsByType.get('bill_agent'),
      peerAgent: configsByType.get('peer_agent'),
      flowAgent: configsByType.get('flow_agent'),
    };
  }
}