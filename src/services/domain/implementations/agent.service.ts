import { IAgentService } from '../interfaces';
import { IAgentRepository } from '@/repositories/interfaces';
import { Agent } from '@/types/api';
import { logger } from '@/utils/logger';

export class AgentService implements IAgentService {
  constructor(private agentRepository: IAgentRepository) {}

  generateSystemPrompt(agent: Agent): string {
    // Check for manual override first
    if (agent.prompt_overrides?.system_prompt) {
      return agent.prompt_overrides.system_prompt;
    }
    
    // Auto-generate from agent configuration
    let prompt = `You are ${agent.name}`;
    
    if (agent.description) {
      prompt += `, ${agent.description}`;
    }
    
    if (agent.goals?.length) {
      prompt += `\n\nYour goals are:\n${agent.goals.map(g => `- ${g}`).join('\n')}`;
    }
    
    if (agent.response_style) {
      prompt += `\n\nResponse style: ${agent.response_style}`;
    }
    
    // Add fallback based on agent type if prompt is too short
    if (prompt.length < 50) {
      prompt += this.getSystemPromptFallback(agent.agent_type);
    }
    
    return prompt;
  }

  private getSystemPromptFallback(agentType: string): string {
    switch (agentType) {
      case 'bill_agent':
        return '\n\nYou are a specialized AI facilitator for democratic deliberation, focusing on policy and legislative analysis.';
      case 'peer_agent':
        return '\n\nYou represent diverse perspectives in democratic deliberation, helping to synthesize participant viewpoints.';
      case 'flow_agent':
        return '\n\nYou act as a facilitator in democratic deliberation, guiding conversation flow and engagement.';
      default:
        return '\n\nYou are an AI assistant helping with democratic deliberation.';
    }
  }

  async getAgents(filter?: Record<string, any>): Promise<Agent[]> {
    try {
      return await this.agentRepository.findAll(filter);
    } catch (error) {
      logger.error('Agent service getAgents failed', { error, filter });
      throw error;
    }
  }

  async getLocalAgents(): Promise<Agent[]> {
    try {
      return await this.agentRepository.findLocalAgents();
    } catch (error) {
      logger.error('Agent service getLocalAgents failed', { error });
      throw error;
    }
  }

  async getGlobalAgents(): Promise<Agent[]> {
    try {
      return await this.agentRepository.findGlobalAgents();
    } catch (error) {
      logger.error('Agent service getGlobalAgents failed', { error });
      throw error;
    }
  }

  async getAgentsByDeliberation(deliberationId: string): Promise<Agent[]> {
    try {
      return await this.agentRepository.findByDeliberation(deliberationId);
    } catch (error) {
      logger.error('Agent service getAgentsByDeliberation failed', { error, deliberationId });
      throw error;
    }
  }

  async createAgent(agent: Omit<Agent, 'id' | 'created_at' | 'updated_at'>): Promise<Agent> {
    try {
      const createdAgent = await this.agentRepository.create(agent);
      
      logger.info('Agent created successfully', { 
        agentId: createdAgent.id, 
        name: createdAgent.name,
        type: createdAgent.agent_type 
      });
      
      return createdAgent;
    } catch (error) {
      logger.error('Agent service createAgent failed', { error, agentName: agent.name });
      throw error;
    }
  }

  async updateAgent(id: string, agent: Partial<Agent>): Promise<Agent> {
    try {
      const updatedAgent = await this.agentRepository.update(id, agent);
      
      logger.info('Agent updated successfully', { 
        agentId: id, 
        updatedFields: Object.keys(agent) 
      });
      
      return updatedAgent;
    } catch (error) {
      logger.error('Agent service updateAgent failed', { error, agentId: id });
      throw error;
    }
  }

  async deleteAgent(id: string): Promise<void> {
    try {
      await this.agentRepository.delete(id);
      
      logger.info('Agent deleted successfully', { agentId: id });
    } catch (error) {
      logger.error('Agent service deleteAgent failed', { error, agentId: id });
      throw error;
    }
  }
}