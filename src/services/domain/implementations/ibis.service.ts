import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';
import { CONFIDENCE_LEVELS } from '@/constants/ibisTypes';

export interface IBISNode {
  id?: string;
  title: string;
  description?: string;
  node_type: string;
  deliberation_id: string;
  message_id?: string;
  parent_node_id?: string;
  position_x?: number;
  position_y?: number;
  created_by: string;
}

export interface IBISRelationship {
  source_node_id: string;
  target_node_id: string;
  relationship_type: string;
  deliberation_id: string;
  created_by: string;
}

export interface NodePosition {
  x: number;
  y: number;
}

export class IBISService {
  /**
   * Calculate intelligent node position based on type and existing nodes
   */
  private calculateNodePosition(nodeType: string, parentNodeId?: string): NodePosition {
    const basePositions = {
      issue: { x: 200, y: 150 },
      position: { x: 400, y: 300 },
      argument: { x: 600, y: 450 },
      uncategorized: { x: 400, y: 300 }
    };
    
    const base = basePositions[nodeType as keyof typeof basePositions] || { x: 400, y: 300 };
    
    // Add some variation while keeping nodes organized
    const variation = 100;
    const offsetX = Math.random() * variation - variation / 2;
    const offsetY = Math.random() * variation - variation / 2;
    
    return {
      x: Math.max(50, Math.min(800, base.x + offsetX)),
      y: Math.max(50, Math.min(600, base.y + offsetY))
    };
  }

  /**
   * Create a new IBIS node with validation and duplicate prevention
   */
  async createNode(nodeData: IBISNode): Promise<{ id: string; node_type: string }> {
    try {
      logger.info('[IBISService] Creating IBIS node', { 
        title: nodeData.title,
        nodeType: nodeData.node_type,
        deliberationId: nodeData.deliberation_id 
      });

      // CRITICAL: Input validation
      if (!nodeData.title || nodeData.title.trim().length === 0) {
        throw new Error('IBIS node title is required');
      }

      if (!nodeData.node_type || !['issue', 'position', 'argument', 'uncategorized'].includes(nodeData.node_type)) {
        throw new Error('Valid IBIS node type is required');
      }

      if (!nodeData.deliberation_id) {
        throw new Error('Deliberation ID is required for IBIS node');
      }

      if (!nodeData.created_by) {
        throw new Error('Creator user ID is required');
      }

      // Sanitize title and description
      const sanitizedTitle = nodeData.title.trim().substring(0, 200);
      const sanitizedDescription = nodeData.description?.trim().substring(0, 1000) || null;

      // Check for duplicate nodes in the same deliberation
      const { data: existingNodes } = await supabase
        .from('ibis_nodes')
        .select('id, title')
        .eq('deliberation_id', nodeData.deliberation_id)
        .eq('created_by', nodeData.created_by)
        .gte('created_at', new Date(Date.now() - 30000).toISOString()) // Last 30 seconds
        .order('created_at', { ascending: false })
        .limit(5);

      // Check for near-duplicate titles
      const duplicateNode = existingNodes?.find(node => {
        const similarity = this.calculateTitleSimilarity(sanitizedTitle, node.title);
        return similarity > 0.85; // 85% similarity threshold
      });

      if (duplicateNode) {
        logger.warn('[IBISService] Potential duplicate node detected', {
          existingNodeId: duplicateNode.id,
          existingTitle: duplicateNode.title,
          newTitle: sanitizedTitle
        });
        throw new Error(`Similar node already exists: "${duplicateNode.title}"`);
      }

      const position = this.calculateNodePosition(nodeData.node_type, nodeData.parent_node_id);

      // Use transaction-like approach for consistency
      const nodeInsertData = {
        title: sanitizedTitle,
        description: sanitizedDescription,
        node_type: nodeData.node_type,
        parent_node_id: nodeData.parent_node_id && nodeData.parent_node_id !== 'none' ? nodeData.parent_node_id : null,
        deliberation_id: nodeData.deliberation_id,
        message_id: nodeData.message_id,
        created_by: nodeData.created_by,
        position_x: nodeData.position_x ?? position.x,
        position_y: nodeData.position_y ?? position.y
      };

      const { data: inserted, error: nodeError } = await supabase
        .from('ibis_nodes')
        .insert(nodeInsertData)
        .select('id, node_type')
        .maybeSingle();

      if (nodeError) {
        logger.error('[IBISService] Error creating node', { error: nodeError, nodeData: nodeInsertData });
        throw nodeError;
      }
      
      if (!inserted) {
        throw new Error('Failed to create IBIS node - no data returned');
      }

      // Trigger embedding generation asynchronously
      try {
        await supabase.functions.invoke('compute-ibis-embeddings', {
          body: {
            deliberationId: nodeData.deliberation_id,
            nodeId: inserted.id,
            force: false
          }
        });
      } catch (embeddingError) {
        logger.warn('[IBISService] Embedding generation failed - node created without embedding', {
          nodeId: inserted.id,
          error: embeddingError
        });
        // Don't fail node creation if embedding fails
      }

      logger.info('[IBISService] Node created successfully', { 
        nodeId: inserted.id,
        title: sanitizedTitle,
        nodeType: inserted.node_type 
      });
      
      return inserted;
    } catch (error) {
      logger.error('[IBISService] Error in createNode', { error, nodeData });
      throw error;
    }
  }

  /**
   * Calculate similarity between two titles for duplicate detection
   */
  private calculateTitleSimilarity(title1: string, title2: string): number {
    const t1 = title1.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const t2 = title2.toLowerCase().replace(/[^\w\s]/g, '').trim();
    
    if (t1 === t2) return 1;
    
    const words1 = t1.split(/\s+/);
    const words2 = t2.split(/\s+/);
    
    const intersection = words1.filter(word => words2.includes(word));
    const union = [...new Set([...words1, ...words2])];
    
    return intersection.length / union.length;
  }

  /**
   * Create multiple IBIS relationships
   */
  async createRelationships(relationships: Array<{
    id: string;
    type: string;
    confidence?: number;
  }>, sourceNodeId: string, deliberationId: string, userId: string): Promise<void> {
    if (!relationships.length) {
      logger.info('[IBISService] No relationships to create');
      return;
    }

    try {
      logger.info('[IBISService] Creating relationships', { 
        count: relationships.length, 
        sourceNodeId,
        relationships 
      });

      const relationshipInserts = relationships.map(rel => ({
        source_node_id: sourceNodeId,
        target_node_id: rel.id,
        relationship_type: rel.type,
        created_by: userId,
        deliberation_id: deliberationId
      }));

      const { error: relError } = await supabase
        .from('ibis_relationships')
        .insert(relationshipInserts);

      if (relError) {
        logger.error('[IBISService] Error creating relationships', { error: relError });
        throw relError;
      }

      logger.info('[IBISService] Relationships created successfully', { count: relationships.length });
    } catch (error) {
      logger.error('[IBISService] Error in createRelationships', { error });
      throw error;
    }
  }

  /**
   * Link message to existing issue - Creates a node for the message and links it to the issue
   */
  async linkMessageToIssue(messageId: string, issueId: string, userId: string, deliberationId: string, messageContent?: string, nodeTitle?: string, nodeType?: string): Promise<string> {
    try {
      logger.info('[IBISService] Linking message to existing issue', { messageId, issueId });

      // Verify the target issue exists
      const { data: targetIssue, error: issueError } = await supabase
        .from('ibis_nodes')
        .select('id, title, node_type')
        .eq('id', issueId)
        .eq('deliberation_id', deliberationId)
        .single();

      if (issueError || !targetIssue) {
        logger.error('[IBISService] Target issue not found', { issueId, error: issueError });
        throw new Error('Target issue not found or not accessible');
      }

      // Get message content if not provided
      let content = messageContent;
      if (!content) {
        const { data: message, error: msgError } = await supabase
          .from('messages')
          .select('content')
          .eq('id', messageId)
          .single();
        
        if (msgError || !message) {
          logger.error('[IBISService] Message not found', { messageId, error: msgError });
          throw new Error('Message not found');
        }
        content = message.content;
      }

      // Create a new node for the message content
      const nodeData: IBISNode = {
        title: nodeTitle || `Response to: ${targetIssue.title}`,
        description: content?.substring(0, 500), // Truncate long content
        node_type: nodeType || 'position', // Default to position when linking to issue
        deliberation_id: deliberationId,
        message_id: messageId,
        created_by: userId
      };

      const newNode = await this.createNode(nodeData);

      // Create relationship between new node and target issue with improved atomicity
      const { error: relError } = await supabase
        .from('ibis_relationships')
        .insert({
          source_node_id: newNode.id,
          target_node_id: issueId,
          relationship_type: nodeType === 'argument' ? 'supports' : 'addresses',
          created_by: userId,
          deliberation_id: deliberationId
        });

      if (relError) {
        logger.error('[IBISService] Error creating relationship', { error: relError });
        // Enhanced cleanup with error handling
        try {
          await supabase.from('ibis_nodes').delete().eq('id', newNode.id);
          logger.info('[IBISService] Successfully cleaned up orphaned node', { nodeId: newNode.id });
        } catch (cleanupError) {
          logger.error('[IBISService] Failed to cleanup orphaned node', { 
            nodeId: newNode.id, 
            cleanupError,
            originalError: relError 
          });
        }
        throw relError;
      }

      logger.info('[IBISService] Message linked to issue successfully', { 
        newNodeId: newNode.id, 
        targetIssueId: issueId 
      });
      
      return newNode.id;
    } catch (error) {
      logger.error('[IBISService] Error in linkMessageToIssue', { error });
      throw error;
    }
  }

  /**
   * Mark message as submitted to IBIS
   */
  async markMessageAsSubmitted(messageId: string): Promise<void> {
    try {
      const { error: messageError } = await supabase
        .from('messages')
        .update({ submitted_to_ibis: true })
        .eq('id', messageId);

      if (messageError) {
        logger.error('[IBISService] Error marking message as submitted', { error: messageError });
        throw messageError;
      }

      logger.info('[IBISService] Message marked as submitted to IBIS', { messageId });
    } catch (error) {
      logger.error('[IBISService] Error in markMessageAsSubmitted', { error });
      throw error;
    }
  }

  /**
   * Get existing nodes for a deliberation
   */
  async getExistingNodes(deliberationId: string): Promise<Array<{
    id: string;
    title: string;
    node_type: string;
  }>> {
    try {
      const { data, error } = await supabase
        .from('ibis_nodes')
        .select('id, title, node_type')
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('[IBISService] Error loading existing nodes', { error });
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error('[IBISService] Error in getExistingNodes', { error });
      throw error;
    }
  }

  /**
   * Generate root issues for a deliberation
   */
  async generateRootIssues(deliberationId: string): Promise<{ success: boolean; count: number }> {
    try {
      logger.info('[IBISService] Generating root issues', { deliberationId });

      // Get deliberation details
      const { data: deliberation, error: deliberationError } = await supabase
        .from('deliberations')
        .select('title, description, notion')
        .eq('id', deliberationId)
        .single();

      if (deliberationError) {
        logger.error('[IBISService] Error fetching deliberation', { error: deliberationError });
        throw deliberationError;
      }

      const { data: rootsData, error: rootsError } = await supabase.functions.invoke('generate-ibis-roots', {
        body: {
          deliberationId,
          deliberationTitle: deliberation.title,
          deliberationDescription: deliberation.description,
          notion: deliberation.notion
        }
      });

      if (rootsError) {
        logger.error('[IBISService] Error generating root issues', { error: rootsError });
        throw rootsError;
      }

      logger.info('[IBISService] Root issues generated successfully', { count: rootsData?.count || 0 });
      return rootsData || { success: false, count: 0 };
    } catch (error) {
      logger.error('[IBISService] Error in generateRootIssues', { error });
      throw error;
    }
  }
}
