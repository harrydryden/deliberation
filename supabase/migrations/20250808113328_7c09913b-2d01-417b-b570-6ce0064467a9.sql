-- Performance indexes for chat and agents
CREATE INDEX IF NOT EXISTS idx_messages_deliberation_created_at
  ON public.messages (deliberation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_user_created_at
  ON public.messages (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_configurations_active_type
  ON public.agent_configurations (is_active, agent_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_knowledge_agent_created_at
  ON public.agent_knowledge (agent_id, created_at);
