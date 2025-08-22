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
  email: string;
  emailConfirmedAt?: string;
  createdAt: string;
  lastSignInAt?: string;
  profile: UserProfile | null;
  role?: string;
  deliberations?: UserDeliberation[];
  isArchived?: boolean;
  archivedAt?: string;
  archivedBy?: string;
  archiveReason?: string;
  accessCode1?: string;
  accessCode2?: string;
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
  description?: string;
  agent_type: string;
  goals?: string[];
  response_style?: string;
  is_active: boolean;
  is_default: boolean;
  deliberation_id?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  preset_questions?: any[];
  facilitator_config?: any;
  prompt_overrides?: Record<string, any>;
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
  response_style?: string;
  goals?: string[];
  facilitator_config?: FacilitatorConfig;
}