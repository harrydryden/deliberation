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
  configuration: Record<string, any>;
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