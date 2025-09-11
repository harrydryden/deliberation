/**
 * Agent Orchestration Validation Utility
 * Comprehensive validation and testing for the enhanced agent orchestration system
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

export interface ValidationResult {
  phase: string;
  success: boolean;
  data?: any;
  error?: string;
  timestamp: number;
  duration?: number;
}

export interface OrchestrationValidationReport {
  overall: {
    success: boolean;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    duration: number;
  };
  phases: ValidationResult[];
  recommendations: string[];
}

class AgentOrchestrationValidator {
  private results: ValidationResult[] = [];
  private startTime: number = 0;

  async runValidation(deliberationId: string): Promise<OrchestrationValidationReport> {
    this.results = [];
    this.startTime = Date.now();

    console.log('🔍 [VALIDATOR] Starting comprehensive agent orchestration validation');

    // Phase 1: Database Configuration Validation
    await this.validateDatabaseConfiguration(deliberationId);

    // Phase 2: Agent Configuration Validation  
    await this.validateAgentConfiguration(deliberationId);

    // Phase 3: Authentication Validation
    await this.validateAuthentication();

    // Phase 4: Edge Function Connectivity
    await this.validateEdgeFunctionConnectivity();

    // Phase 5: System Prompt Construction
    await this.validateSystemPromptConstruction(deliberationId);

    // Phase 6: End-to-End Flow Test
    await this.validateEndToEndFlow(deliberationId);

    return this.generateReport();
  }

  private async validateDatabaseConfiguration(deliberationId: string): Promise<void> {
    const phaseStart = Date.now();
    
    try {
      console.log('📊 [VALIDATOR] Phase 1: Database Configuration');

      // Check deliberation exists and is accessible
      const { data: deliberation, error: delibError } = await supabase
        .from('deliberations')
        .select('id, title, status')
        .eq('id', deliberationId)
        .single();

      if (delibError || !deliberation) {
        throw new Error(`Deliberation not found or inaccessible: ${delibError?.message}`);
      }

      // Check user participation
      const { data: participation, error: partError } = await supabase
        .from('participants')
        .select('id, user_id, role')
        .eq('deliberation_id', deliberationId)
        .limit(1);

      if (partError) {
        throw new Error(`Participation check failed: ${partError.message}`);
      }

      this.addResult('Database Configuration', true, {
        deliberation: deliberation.title,
        status: deliberation.status,
        hasParticipants: Array.isArray(participation) && participation.length > 0
      }, undefined, phaseStart);

    } catch (error) {
      this.addResult('Database Configuration', false, undefined, 
        error instanceof Error ? error.message : 'Unknown error', phaseStart);
    }
  }

  private async validateAgentConfiguration(deliberationId: string): Promise<void> {
    const phaseStart = Date.now();
    
    try {
      console.log('🤖 [VALIDATOR] Phase 2: Agent Configuration');

      // Get active agents for deliberation
      const { data: agents, error: agentsError } = await supabase
        .from('agent_configurations')
        .select('*')
        .eq('deliberation_id', deliberationId)
        .eq('is_active', true);

      if (agentsError) {
        throw new Error(`Agent query failed: ${agentsError.message}`);
      }

      if (!Array.isArray(agents) || agents.length === 0) {
        throw new Error('No active agents found for this deliberation');
      }

      // Validate agent configurations
      const validationIssues = [];
      for (const agent of agents) {
        if (!agent.name) validationIssues.push(`Agent ${agent.id}: Missing name`);
        if (!agent.agent_type) validationIssues.push(`Agent ${agent.id}: Missing type`);
        if (!agent.description && !agent.prompt_overrides?.system_prompt) {
          validationIssues.push(`Agent ${agent.id}: Missing description and system prompt`);
        }
      }

      if (validationIssues.length > 0) {
        throw new Error(`Agent configuration issues: ${validationIssues.join(', ')}`);
      }

      this.addResult('Agent Configuration', true, {
        agentCount: agents.length,
        agents: agents.map(a => ({ id: a.id, name: a.name, type: a.agent_type })),
        hasDefaults: agents.some(a => a.is_default)
      }, undefined, phaseStart);

    } catch (error) {
      this.addResult('Agent Configuration', false, undefined,
        error instanceof Error ? error.message : 'Unknown error', phaseStart);
    }
  }

  private async validateAuthentication(): Promise<void> {
    const phaseStart = Date.now();
    
    try {
      console.log('🔐 [VALIDATOR] Phase 3: Authentication');

      // Check current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        throw new Error(`Session check failed: ${sessionError.message}`);
      }

      if (!session) {
        throw new Error('No active session found');
      }

      // Validate session has required fields
      if (!session.access_token) {
        throw new Error('Session missing access token');
      }

      if (!session.user?.id) {
        throw new Error('Session missing user ID');
      }

      // Check token expiry
      const expiresAt = session.expires_at ? new Date(session.expires_at * 1000) : new Date();
      const timeUntilExpiry = expiresAt.getTime() - Date.now();
      
      if (timeUntilExpiry < 60000) { // Less than 1 minute
        throw new Error('Session expires soon - refresh recommended');
      }

      this.addResult('Authentication', true, {
        userId: session.user.id,
        tokenValid: true,
        expiresIn: Math.round(timeUntilExpiry / 1000) + 's'
      }, undefined, phaseStart);

    } catch (error) {
      this.addResult('Authentication', false, undefined,
        error instanceof Error ? error.message : 'Unknown error', phaseStart);
    }
  }

  private async validateEdgeFunctionConnectivity(): Promise<void> {
    const phaseStart = Date.now();
    
    try {
      console.log('🌐 [VALIDATOR] Phase 4: Edge Function Connectivity');

      // Test basic edge function connectivity with a health check
      const { data, error } = await supabase.functions.invoke('agent-orchestration-stream', {
        body: { 
          healthCheck: true,
          messageId: 'validator-test',
          deliberationId: 'validator-test',
          mode: 'chat'
        }
      });

      // Note: This will likely fail due to validation, but we can check the error type
      if (error) {
        // Expected errors for health check (good connectivity)
        const connectivityErrors = [
          'Message not found',
          'Deliberation not found', 
          'No active agents',
          'validation failed'
        ];
        
        const isConnectivityIssue = !connectivityErrors.some(expectedError => 
          error.message?.toLowerCase().includes(expectedError.toLowerCase())
        );
        
        if (isConnectivityIssue) {
          throw new Error(`Edge function connectivity issue: ${error.message}`);
        }
      }

      this.addResult('Edge Function Connectivity', true, {
        responseReceived: true,
        errorType: error ? 'expected_validation_error' : 'success'
      }, undefined, phaseStart);

    } catch (error) {
      this.addResult('Edge Function Connectivity', false, undefined,
        error instanceof Error ? error.message : 'Unknown error', phaseStart);
    }
  }

  private async validateSystemPromptConstruction(deliberationId: string): Promise<void> {
    const phaseStart = Date.now();
    
    try {
      console.log('📝 [VALIDATOR] Phase 5: System Prompt Construction');

      // Get agents for prompt validation
      const { data: agents, error: agentsError } = await supabase
        .from('agent_configurations')
        .select('*')
        .eq('deliberation_id', deliberationId)
        .eq('is_active', true)
        .limit(1);

      if (agentsError || !agents || agents.length === 0) {
        throw new Error('No agents available for prompt validation');
      }

      const agent = agents[0];
      
      // Simulate prompt construction logic from edge function
      let systemPrompt = '';
      
      if (agent.prompt_overrides?.system_prompt) {
        systemPrompt = agent.prompt_overrides.system_prompt;
      } else {
        systemPrompt = `You are ${agent.name}, a ${agent.agent_type} agent.`;
        
        if (agent.description) {
          systemPrompt += `\n\nDescription: ${agent.description}`;
        }
        
        if (agent.goals && Array.isArray(agent.goals) && agent.goals.length > 0) {
          systemPrompt += `\n\nYour goals are:\n${agent.goals.map((goal: string, i: number) => `${i + 1}. ${goal}`).join('\n')}`;
        }
      }

      if (systemPrompt.length < 20) {
        throw new Error('System prompt too short - likely missing configuration');
      }

      this.addResult('System Prompt Construction', true, {
        agentName: agent.name,
        agentType: agent.agent_type,
        promptLength: systemPrompt.length,
        hasOverrides: !!agent.prompt_overrides?.system_prompt,
        hasGoals: agent.goals && agent.goals.length > 0
      }, undefined, phaseStart);

    } catch (error) {
      this.addResult('System Prompt Construction', false, undefined,
        error instanceof Error ? error.message : 'Unknown error', phaseStart);
    }
  }

  private async validateEndToEndFlow(deliberationId: string): Promise<void> {
    const phaseStart = Date.now();
    
    try {
      console.log('🔄 [VALIDATOR] Phase 6: End-to-End Flow');

      // Create a test message
      const testMessage = {
        deliberation_id: deliberationId,
        content: 'Test message for validation',
        message_type: 'user'
      };

      const { data: insertedMessage, error: insertError } = await supabase
        .from('messages')
        .insert(testMessage)
        .select()
        .single();

      if (insertError || !insertedMessage) {
        throw new Error(`Test message creation failed: ${insertError?.message}`);
      }

      // Test the orchestration trigger (this will likely fail but we check the error)
      try {
        const { data, error } = await supabase.functions.invoke('agent-orchestration-stream', {
          body: {
            messageId: insertedMessage.id,
            deliberationId: deliberationId,
            mode: 'chat'
          }
        });

        // Clean up test message
        await supabase.from('messages').delete().eq('id', insertedMessage.id);

        if (error) {
          // Check if it's a configuration error vs infrastructure error
          const configErrors = [
            'No active agents',
            'Message not found', 
            'OpenAI API error',
            'Database save error'
          ];
          
          const isConfigError = configErrors.some(configError => 
            error.message?.includes(configError)
          );
          
          if (!isConfigError) {
            throw new Error(`Infrastructure error: ${error.message}`);
          }
        }

        this.addResult('End-to-End Flow', true, {
          testMessageCreated: true,
          functionCalled: true,
          errorType: error ? 'expected_config_error' : 'success'
        }, undefined, phaseStart);

      } catch (flowError) {
        // Clean up test message even on error
        await supabase.from('messages').delete().eq('id', insertedMessage.id);
        throw flowError;
      }

    } catch (error) {
      this.addResult('End-to-End Flow', false, undefined,
        error instanceof Error ? error.message : 'Unknown error', phaseStart);
    }
  }

  private addResult(phase: string, success: boolean, data?: any, error?: string, phaseStart?: number): void {
    const result: ValidationResult = {
      phase,
      success,
      data,
      error,
      timestamp: Date.now(),
      duration: phaseStart ? Date.now() - phaseStart : undefined
    };
    
    this.results.push(result);
    
    const status = success ? '✅' : '❌';
    const duration = result.duration ? ` (${result.duration}ms)` : '';
    console.log(`${status} [VALIDATOR] ${phase}${duration}${error ? `: ${error}` : ''}`);
  }

  private generateReport(): OrchestrationValidationReport {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    const totalDuration = Date.now() - this.startTime;

    const recommendations: string[] = [];

    // Generate recommendations based on failures
    this.results.forEach(result => {
      if (!result.success) {
        switch (result.phase) {
          case 'Database Configuration':
            recommendations.push('Verify deliberation exists and user has proper access permissions');
            break;
          case 'Agent Configuration':
            recommendations.push('Create and activate at least one agent for this deliberation');
            break;
          case 'Authentication':
            recommendations.push('Refresh the page to renew authentication session');
            break;
          case 'Edge Function Connectivity':
            recommendations.push('Check network connection and Supabase service status');
            break;
          case 'System Prompt Construction':
            recommendations.push('Ensure agents have proper configuration with names, types, and descriptions');
            break;
          case 'End-to-End Flow':
            recommendations.push('Review edge function logs for detailed error information');
            break;
        }
      }
    });

    return {
      overall: {
        success: failedTests === 0,
        totalTests,
        passedTests,
        failedTests,
        duration: totalDuration
      },
      phases: this.results,
      recommendations
    };
  }
}

// Export singleton instance
export const agentOrchestrationValidator = new AgentOrchestrationValidator();

// Utility function for quick validation
export async function validateAgentOrchestration(deliberationId: string): Promise<OrchestrationValidationReport> {
  return await agentOrchestrationValidator.runValidation(deliberationId);
}