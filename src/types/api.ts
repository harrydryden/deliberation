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
  is_default: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Deliberation {
  id: string;
  title: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiError {
  message: string;
  status: number;
  code?: string;
}