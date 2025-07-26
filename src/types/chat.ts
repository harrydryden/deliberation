export interface ChatMessage {
  id: string;
  content: string;
  message_type: 'user' | 'bill_agent' | 'peer_agent' | 'flow_agent';
  created_at: string;
  user_id?: string;
  agent_context?: any;
  submitted_to_ibis?: boolean;
}

export interface AgentConfiguration {
  id: string;
  agent_type: string;
  name: string;
  system_prompt: string;
  description?: string;
  goals?: string[];
  response_style?: string;
  is_active: boolean;
  is_default: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface IbisNode {
  id: string;
  title: string;
  description?: string;
  node_type: 'issue' | 'position' | 'argument';
  parent_node_id?: string;
  deliberation_id?: string;
  message_id?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  position_x?: number;
  position_y?: number;
}

export interface SessionState {
  lastActivityTime: number;
  messageCount: number;
  statementCount: number;
  questionCount: number;
  topicsEngaged: string[];
  usedQuestionIds: string[];
  proactivePromptsCount: number;
  optedOutOfPrompts: boolean;
}

export type InputType = 'QUESTION' | 'STATEMENT' | 'OTHER';
export type AgentType = 'bill_agent' | 'peer_agent' | 'flow_agent';
export type MessageType = 'user' | AgentType;