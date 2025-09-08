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
   * Create a new IBIS node
   */
  async createNode(nodeData: IBISNode): Promise<{ id: string; node_type: string }> {
    try {
      logger.info('[IBISService] Creating IBIS node', { nodeData });

      const position = this.calculateNodePosition(nodeData.node_type, nodeData.parent_node_id);

      const { data: inserted, error: nodeError } = await supabase
        .from('ibis_nodes')
        .insert({
          title: nodeData.title.trim(),
          description: nodeData.description?.trim() || null,
          node_type: nodeData.node_type,
          parent_node_id: nodeData.parent_node_id && nodeData.parent_node_id !== 'none' ? nodeData.parent_node_id : null,
          deliberation_id: nodeData.deliberation_id,
          message_id: nodeData.message_id,
          created_by: nodeData.created_by,
          position_x: nodeData.position_x ?? position.x,
          position_y: nodeData.position_y ?? position.y
        })
        .select('id, node_type')
        .maybeSingle();

      if (nodeError) {
        logger.error('[IBISService] Error creating node', { error: nodeError });
        throw nodeError;
      }
      
      if (!inserted) {
        throw new Error('Failed to create IBIS node');
      }

      logger.info('[IBISService] Node created successfully', { nodeId: inserted.id });
      return inserted;
    } catch (error) {
      logger.error('[IBISService] Error in createNode', { error });
      throw error;
    }
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

      // Create relationship between new node and target issue
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
        // Try to clean up the created node
        await supabase.from('ibis_nodes').delete().eq('id', newNode.id);
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
