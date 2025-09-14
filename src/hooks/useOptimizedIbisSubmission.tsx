import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { logger } from '@/utils/logger';
import { performanceMonitor } from '@/utils/performanceMonitor';

interface IbisSubmissionData {
  title: string;
  description: string;
  nodeType: string;
  parentNodeId?: string;
  smartConnections: Array<{id: string, type: string, confidence: number}>;
  selectedIssueId?: string | null;
  isLinkingMode: boolean;
}

interface AIClassification {
  title: string;
  keywords: string[];
  nodeType: string;
  description: string;
  confidence: number;
  stanceScore?: number;
}

interface BackgroundTask {
  name: string;
  promise: Promise<any>;
}

/**
 * Optimized IBIS submission hook - separates core submission from background tasks
 */
export const useOptimizedIbisSubmission = (
  deliberationId: string,
  messageId: string,
  messageContent: string,
  onSuccess?: () => void
) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const backgroundTasks: BackgroundTask[] = [];

  const submitToIbis = useCallback(async (
    submissionData: IbisSubmissionData,
    aiSuggestions?: AIClassification
  ) => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    performanceMonitor.mark('ibis-submission-start');

    try {
      // Phase 1: Core IBIS node creation (fast, synchronous)
      const nodeId = await createCoreNode(submissionData, aiSuggestions);
      logger.info('[OptimizedSubmission] Core node created', { nodeId });

      // Phase 2: Update message as submitted
      await markMessageAsSubmitted();

      // Phase 3: Essential relationships (blocking)
      if (submissionData.selectedIssueId || submissionData.isLinkingMode) {
        await createEssentialRelationships(submissionData, nodeId);
      }

      performanceMonitor.measure('ibis-core-submission', 'ibis-submission-start');

      // Show success immediately
      toast.success("Successfully shared to deliberation", {
        description: "Your contribution has been added"
      });

      logger.info('[OptimizedSubmission] Core submission completed successfully', { nodeId });

      // Trigger UI update immediately
      setTimeout(() => {
        onSuccess?.();
      }, 50); // Minimal delay for UI consistency

      // Phase 4: Background tasks (non-blocking)
      scheduleBackgroundTasks(submissionData, nodeId, aiSuggestions);

    } catch (error: any) {
      logger.error('[OptimizedSubmission] Error in core submission', { error });
      toast.error("Error sharing to deliberation", {
        description: error.message || "Please try again"
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [deliberationId, messageId, messageContent, onSuccess, isSubmitting]);

  const createCoreNode = async (
    submissionData: IbisSubmissionData,
    aiSuggestions?: AIClassification
  ): Promise<string> => {
    const { supabase } = await import('@/integrations/supabase/client');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Create the IBIS node with minimal required data
    const { data: nodeData, error: nodeError } = await supabase
      .from('ibis_nodes')
      .insert({
        title: submissionData.title,
        description: submissionData.description,
        node_type: submissionData.nodeType,
        deliberation_id: deliberationId,
        message_id: messageId,
        parent_node_id: submissionData.parentNodeId || null,
        created_by: user.id, // Required for RLS policy
        // Skip embeddings for now - will be generated in background
      })
      .select('id')
      .single();

    if (nodeError) throw nodeError;
    if (!nodeData?.id) throw new Error('Failed to create node');

    return nodeData.id;
  };

  const markMessageAsSubmitted = async () => {
    const { supabase } = await import('@/integrations/supabase/client');

    const { error } = await supabase
      .from('messages')
      .update({ submitted_to_ibis: true })
      .eq('id', messageId);

    if (error) {
      logger.warn('[OptimizedSubmission] Failed to mark message as submitted', { error });
      // Don't throw - this is not critical for core functionality
    }
  };

  const createEssentialRelationships = async (
    submissionData: IbisSubmissionData,
    nodeId: string
  ) => {
    const { supabase } = await import('@/integrations/supabase/client');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Only create high-confidence or user-selected relationships immediately
    const essentialConnections = submissionData.smartConnections.filter(
      conn => conn.confidence > 0.8 || submissionData.selectedIssueId === conn.id
    );

    if (essentialConnections.length === 0) return;

    const relationshipData = essentialConnections.map(connection => ({
      source_node_id: nodeId,
      target_node_id: connection.id,
      relationship_type: connection.type,
      deliberation_id: deliberationId,
      created_by: user.id
    }));

    const { error } = await supabase
      .from('ibis_relationships')
      .insert(relationshipData);

    if (error) {
      logger.warn('[OptimizedSubmission] Failed to create essential relationships', { error });
      // Don't throw - relationships can be added later
    }
  };

  const scheduleBackgroundTasks = (
    submissionData: IbisSubmissionData,
    nodeId: string,
    aiSuggestions?: AIClassification
  ) => {
    // Task 1: Generate embeddings
    const embeddingTask = generateEmbeddingsBackground(nodeId, submissionData.title, submissionData.description);
    
    // Task 2: Create remaining relationships
    const relationshipTask = createRemainingRelationshipsBackground(submissionData, nodeId);
    
    // Task 3: Update stance score
    const stanceTask = updateStanceScoreBackground(nodeId, aiSuggestions);

    // Execute all background tasks
    Promise.allSettled([embeddingTask, relationshipTask, stanceTask])
      .then(results => {
        const failed = results.filter(r => r.status === 'rejected').length;
        if (failed > 0) {
          logger.warn('[OptimizedSubmission] Some background tasks failed', { 
            failed, 
            total: results.length 
          });
        } else {
          logger.info('[OptimizedSubmission] All background tasks completed successfully');
        }
      });
  };

  const generateEmbeddingsBackground = async (
    nodeId: string,
    title: string,
    description: string
  ) => {
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Call embedding generation function
      const { error } = await supabase.functions.invoke('ibis_embeddings', {
        body: {
          nodeId,
          content: `${title}\n\n${description}`,
          action: 'generate_single'
        }
      });

      if (error) throw error;
      
      logger.info('[OptimizedSubmission] Embeddings generated successfully', { nodeId });
    } catch (error) {
      logger.warn('[OptimizedSubmission] Failed to generate embeddings', { error, nodeId });
    }
  };

  const createRemainingRelationshipsBackground = async (
    submissionData: IbisSubmissionData,
    nodeId: string
  ) => {
    try {
      // Create lower-confidence relationships that weren't essential
      const remainingConnections = submissionData.smartConnections.filter(
        conn => conn.confidence <= 0.8 && submissionData.selectedIssueId !== conn.id
      );

      if (remainingConnections.length === 0) return;

      const { supabase } = await import('@/integrations/supabase/client');

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const relationshipData = remainingConnections.map(connection => ({
        source_node_id: nodeId,
        target_node_id: connection.id,
        relationship_type: connection.type,
        deliberation_id: deliberationId,
        created_by: user.id
      }));

      const { error } = await supabase
        .from('ibis_relationships')
        .insert(relationshipData);

      if (error) throw error;

      logger.info('[OptimizedSubmission] Remaining relationships created', { 
        count: remainingConnections.length 
      });
    } catch (error) {
      logger.warn('[OptimizedSubmission] Failed to create remaining relationships', { error });
    }
  };

  const updateStanceScoreBackground = async (
    nodeId: string,
    aiSuggestions?: AIClassification
  ) => {
    try {
      const { supabase } = await import('@/integrations/supabase/client');

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        logger.warn('[OptimizedSubmission] User not available for stance update', {
          userId: 'undefined',
          nodeId
        });
        return;
      }

      logger.info('[OptimizedSubmission] Starting stance score calculation', {
        userId: user.id,
        deliberationId,
        nodeId,
        hasAISuggestions: !!aiSuggestions
      });

      // Always invoke stance calculation; include AI stance when available
      const body: Record<string, any> = {
        userId: user.id,
        deliberationId,
        content: messageContent,
      };
      if (typeof aiSuggestions?.stanceScore === 'number') {
        body.stanceScore = aiSuggestions.stanceScore;
        logger.debug('[OptimizedSubmission] Including AI stance score in calculation', {
          stanceScore: aiSuggestions.stanceScore
        });
      }

      const { data, error } = await supabase.functions.invoke('calculate_user_stance', {
        body
      });

      if (error) {
        logger.error('[OptimizedSubmission] Stance calculation API error', { 
          error,
          userId: user.id,
          deliberationId 
        });
        throw error;
      }

      logger.info('[OptimizedSubmission] Stance score updated', {
        nodeId,
        stanceScore: data?.stanceScore ?? aiSuggestions?.stanceScore,
        userId: user.id,
        deliberationId
      });

      // Verify the stance was actually stored
      try {
        const { StanceService } = await import('@/services/domain/implementations/stance.service');
        const stanceService = new StanceService();
        const verificationResult = await stanceService.getUserStanceScore(user.id, deliberationId);
        logger.debug('[OptimizedSubmission] Stance score verification', {
          stored: !!verificationResult,
          stanceScore: verificationResult?.stanceScore
        });
      } catch (verificationError) {
        logger.warn('[OptimizedSubmission] Stance verification failed', { verificationError });
      }
    } catch (error) {
      logger.error('[OptimizedSubmission] Failed to update stance score', { 
        error, 
        nodeId,
        aiSuggestionsAvailable: !!aiSuggestions 
      });
    }
  };

  return {
    submitToIbis,
    isSubmitting
  };
};