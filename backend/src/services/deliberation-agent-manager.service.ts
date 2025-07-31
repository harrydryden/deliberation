import { PrismaClient } from '@prisma/client';
import { AgentFactory, AgentInstances, DeliberationContext } from './agent-factory.service';
import { logger } from '../utils/logger';

export class DeliberationAgentManager {
  private prisma: PrismaClient;
  private agentFactory: AgentFactory;
  private agentInstances: Map<string, AgentInstances> = new Map();
  private agentCreationPromises: Map<string, Promise<AgentInstances>> = new Map();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.agentFactory = new AgentFactory(prisma);
  }

  async getAgentsForDeliberation(deliberationId: string): Promise<AgentInstances> {
    // Return existing instances if available
    if (this.agentInstances.has(deliberationId)) {
      return this.agentInstances.get(deliberationId)!;
    }

    // If agents are currently being created, wait for that process
    if (this.agentCreationPromises.has(deliberationId)) {
      return await this.agentCreationPromises.get(deliberationId)!;
    }

    // Create new agents for this deliberation
    const creationPromise = this.createAgentsForDeliberation(deliberationId);
    this.agentCreationPromises.set(deliberationId, creationPromise);

    try {
      const agents = await creationPromise;
      this.agentInstances.set(deliberationId, agents);
      return agents;
    } finally {
      this.agentCreationPromises.delete(deliberationId);
    }
  }

  private async createAgentsForDeliberation(deliberationId: string): Promise<AgentInstances> {
    try {
      // Get deliberation context
      const deliberation = await this.prisma.deliberation.findUnique({
        where: { id: deliberationId },
        select: {
          id: true,
          title: true,
          description: true,
          notion: true,
          facilitatorId: true,
        },
      });

      if (!deliberation) {
        throw new Error(`Deliberation ${deliberationId} not found`);
      }

      const deliberationContext: DeliberationContext = {
        id: deliberation.id,
        title: deliberation.title,
        description: deliberation.description || undefined,
        notion: deliberation.notion || undefined,
        facilitatorId: deliberation.facilitatorId || undefined,
      };

      logger.info({ deliberationId }, 'Creating agents for deliberation');

      const agents = await this.agentFactory.createAgentsForDeliberation(deliberationContext);

      logger.info({ deliberationId }, 'Successfully created agents for deliberation');

      return agents;
    } catch (error) {
      logger.error({ error, deliberationId }, 'Failed to create agents for deliberation');
      throw error;
    }
  }

  async cleanupAgentsForDeliberation(deliberationId: string): Promise<void> {
    try {
      if (this.agentInstances.has(deliberationId)) {
        // Perform any cleanup if needed (close connections, clear caches, etc.)
        const agents = this.agentInstances.get(deliberationId)!;
        
        // Call cleanup methods if they exist
        if (typeof agents.billAgent.cleanup === 'function') {
          await agents.billAgent.cleanup();
        }
        if (typeof agents.peerAgent.cleanup === 'function') {
          await agents.peerAgent.cleanup();
        }
        if (typeof agents.aiService.cleanup === 'function') {
          await agents.aiService.cleanup();
        }

        this.agentInstances.delete(deliberationId);
        logger.info({ deliberationId }, 'Cleaned up agents for deliberation');
      }
    } catch (error) {
      logger.error({ error, deliberationId }, 'Failed to cleanup agents for deliberation');
    }
  }

  async cleanupAllAgents(): Promise<void> {
    const deliberationIds = Array.from(this.agentInstances.keys());
    await Promise.all(
      deliberationIds.map(id => this.cleanupAgentsForDeliberation(id))
    );
  }

  getActiveDeliberations(): string[] {
    return Array.from(this.agentInstances.keys());
  }

  getAgentCount(): number {
    return this.agentInstances.size;
  }
}