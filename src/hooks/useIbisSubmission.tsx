import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { useStanceService } from '@/hooks/useServices';
import { IBISService } from '@/services/domain/implementations/ibis.service';
import { logger } from '@/utils/logger';

export interface IbisSubmissionData {
  title: string;
  description: string;
  nodeType: string;
  parentNodeId?: string;
  smartConnections: Array<{
    id: string;
    type: string;
    confidence: number;
  }>;
  selectedIssueId?: string;
  isLinkingMode: boolean;
}

export interface AIClassification {
  title: string;
  keywords: string[];
  nodeType: string;
  description: string;
  confidence: number;
  stanceScore?: number;
}

export const useIbisSubmission = (
  deliberationId: string,
  messageId: string,
  messageContent: string,
  onSuccess?: () => void
) => {
  const { toast } = useToast();
  const { user } = useSupabaseAuth();
  const stanceService = useStanceService();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const ibisService = new IBISService();

  const submitToIbis = useCallback(async (
    submissionData: IbisSubmissionData,
    aiSuggestions?: AIClassification
  ) => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    if (!submissionData.title.trim() || !submissionData.nodeType) {
      throw new Error('Please provide a title and select a node type');
    }

    setIsSubmitting(true);

    try {
      logger.info('[useIbisSubmission] Starting IBIS submission', { submissionData });

      let nodeId: string;
      const allRelationships = submissionData.smartConnections;

      if (submissionData.isLinkingMode && submissionData.selectedIssueId) {
        // Link to existing issue - creates a new node and links it
        const linkedNodeId = await ibisService.linkMessageToIssue(
          messageId,
          submissionData.selectedIssueId,
          user.id,
          deliberationId,
          messageContent,
          submissionData.title,
          submissionData.nodeType
        );
        nodeId = linkedNodeId;
      } else {
        // Create new node
        const nodeData = {
          title: submissionData.title.trim(),
          description: submissionData.description.trim() || undefined,
          node_type: submissionData.nodeType,
          parent_node_id: submissionData.parentNodeId && submissionData.parentNodeId !== 'none' 
            ? submissionData.parentNodeId 
            : undefined,
          deliberation_id: deliberationId,
          message_id: messageId,
          created_by: user.id
        };

        const inserted = await ibisService.createNode(nodeData);
        nodeId = inserted.id;

        // Create relationships if not in linking mode
        if (!submissionData.isLinkingMode && allRelationships.length > 0) {
          await ibisService.createRelationships(
            allRelationships,
            nodeId,
            deliberationId,
            user.id
          );
        }
      }

      // Store stance score if available from AI classification; otherwise calculate via AI
      try {
        if (aiSuggestions?.stanceScore !== undefined) {
          await stanceService.updateStanceScore(
            user.id,
            deliberationId,
            aiSuggestions.stanceScore,
            aiSuggestions.confidence || 0.5,
            {
              source: 'ibis_submission',
              nodeType: submissionData.nodeType,
              keywords: aiSuggestions.keywords,
              messageId
            }
          );
        } else {
          // Fallback: calculate stance from semantic analysis of the submitted content
          const result = await stanceService.calculateStanceFromSemantic(
            user.id,
            deliberationId,
            messageContent
          );
          await stanceService.updateStanceScore(
            user.id,
            deliberationId,
            result.stanceScore,
            result.confidenceScore,
            result.semanticAnalysis
          );
        }
      } catch (stanceError) {
        logger.error('[useIbisSubmission] Failed to update/calculate stance score', { error: stanceError });
        // Don't fail the entire submission if stance storage fails
      }

      // Mark message as submitted to IBIS
      await ibisService.markMessageAsSubmitted(messageId);

      toast({
        title: "Success",
        description: "Thanks for sharing your view"
      });

      logger.info('[useIbisSubmission] IBIS submission completed successfully', { nodeId });

      // Add small delay to ensure DB changes are propagated before reloading
      setTimeout(() => {
        onSuccess?.();
      }, 100);

    } catch (error: any) {
      logger.error('[useIbisSubmission] Error submitting to IBIS', { error });
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to submit message to IBIS"
      });
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }, [user, deliberationId, messageId, toast, onSuccess, stanceService]);

  return {
    submitToIbis,
    isSubmitting
  };
};