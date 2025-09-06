-- Add performance indexes for IBIS operations

-- Index for IBIS nodes by deliberation_id (most common query)
CREATE INDEX IF NOT EXISTS idx_ibis_nodes_deliberation_id 
ON ibis_nodes(deliberation_id);

-- Index for IBIS nodes by message_id (for linking messages to nodes)
CREATE INDEX IF NOT EXISTS idx_ibis_nodes_message_id 
ON ibis_nodes(message_id) WHERE message_id IS NOT NULL;

-- Index for IBIS nodes by node_type (for filtering by type)
CREATE INDEX IF NOT EXISTS idx_ibis_nodes_type 
ON ibis_nodes(node_type);

-- Index for IBIS nodes by created_by (for user-specific queries)
CREATE INDEX IF NOT EXISTS idx_ibis_nodes_created_by 
ON ibis_nodes(created_by);

-- Composite index for IBIS nodes by deliberation_id and node_type
CREATE INDEX IF NOT EXISTS idx_ibis_nodes_deliberation_type 
ON ibis_nodes(deliberation_id, node_type);

-- Index for IBIS relationships by deliberation_id (most common query)
CREATE INDEX IF NOT EXISTS idx_ibis_relationships_deliberation_id 
ON ibis_relationships(deliberation_id);

-- Index for IBIS relationships by source_node_id (for finding outgoing relationships)
CREATE INDEX IF NOT EXISTS idx_ibis_relationships_source_node 
ON ibis_relationships(source_node_id);

-- Index for IBIS relationships by target_node_id (for finding incoming relationships)
CREATE INDEX IF NOT EXISTS idx_ibis_relationships_target_node 
ON ibis_relationships(target_node_id);

-- Index for IBIS relationships by relationship_type
CREATE INDEX IF NOT EXISTS idx_ibis_relationships_type 
ON ibis_relationships(relationship_type);

-- Composite index for finding relationships between specific nodes
CREATE INDEX IF NOT EXISTS idx_ibis_relationships_nodes 
ON ibis_relationships(source_node_id, target_node_id);

-- Index for messages by deliberation_id and submitted_to_ibis status
CREATE INDEX IF NOT EXISTS idx_messages_deliberation_ibis 
ON messages(deliberation_id, submitted_to_ibis) WHERE submitted_to_ibis = true;

-- Index for participants by user_id (for checking user participation)
CREATE INDEX IF NOT EXISTS idx_participants_user_id 
ON participants(user_id);

-- Composite index for participants by deliberation_id and user_id
CREATE INDEX IF NOT EXISTS idx_participants_deliberation_user 
ON participants(deliberation_id, user_id);

-- Index for agent_ratings by message_id (for getting message ratings)
CREATE INDEX IF NOT EXISTS idx_agent_ratings_message_id 
ON agent_ratings(message_id);

-- Index for user_stance_scores by deliberation_id
CREATE INDEX IF NOT EXISTS idx_user_stance_scores_deliberation 
ON user_stance_scores(deliberation_id);

-- Composite index for user_stance_scores by user_id and deliberation_id
CREATE INDEX IF NOT EXISTS idx_user_stance_scores_user_deliberation 
ON user_stance_scores(user_id, deliberation_id);