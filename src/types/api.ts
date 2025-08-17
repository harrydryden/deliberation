export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface User {
  id: string;
  accessCode: string;
  profile: UserProfile | null;
  role?: string;
  deliberations?: UserDeliberation[];
  isArchived?: boolean;
  archivedAt?: string;
  archivedBy?: string;
  archiveReason?: string;
}

export interface UserDeliberation {
  id: string;
  title: string;
  role: string;
}

export interface UserProfile {
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  expertiseAreas: string[];
}

export interface Message {
  id: string;
  content: string;
  messageType: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  response_style?: string;
  goals?: string[];
  agent_type: string;
  facilitator_config?: FacilitatorConfig;
  is_default: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deliberation?: {
    id: string;
    title: string;
    status: string;
  };
}

export interface FacilitatorConfig {
  prompting_enabled: boolean;
  prompting_interval_minutes: number;
  max_prompts_per_session: number;
  prompting_questions: FacilitatorQuestion[];
  ibis_facilitation?: IbisFacilitationConfig;
}

export interface FacilitatorQuestion {
  id: string;
  text: string;
  category: 'exploration' | 'perspective' | 'clarification' | 'synthesis' | 'action';
  weight: number;
}

export interface IbisFacilitationConfig {
  enabled: boolean;
  elicit_issue_prompt: string;
  elicit_position_prompt: string;
  elicit_argument_prompt: string;
}

export interface Deliberation {
  id: string;
  title: string;
  description: string;
  notion?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  // Additional fields populated by repository
  facilitator_id?: string;
  start_time?: string;
  end_time?: string;
  max_participants?: number;
  is_public?: boolean;
  created_at?: string;
  updated_at?: string;
  participant_count?: number;
  is_user_participant?: boolean;
}

export interface ApiError {
  message: string;
  status: number;
  code?: string;
}

export interface LocalAgentCreate {
  name: string;
  agent_type: string;
  deliberationId: string;
  description?: string;
  system_prompt?: string;
  response_style?: string;
  goals?: string[];
  facilitator_config?: FacilitatorConfig;
}