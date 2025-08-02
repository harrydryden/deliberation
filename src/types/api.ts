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
}

export interface FacilitatorQuestion {
  id: string;
  text: string;
  category: 'exploration' | 'perspective' | 'clarification' | 'synthesis' | 'action';
  weight: number;
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
  system_prompt?: string;
  response_style?: string;
  goals?: string[];
  facilitator_config?: FacilitatorConfig;
}