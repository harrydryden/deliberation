/**
 * Consolidated type definitions for the application
 * This file replaces the fragmented type definitions across multiple files
 */

// Re-export all Zod schemas and inferred types
export * from '@/schemas/index';

// Common utility types
export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

// Enhanced API Response types (replacing api.ts)
export interface ApiResponse<T = unknown> {
  data: T;
  error: string | null;
  success: boolean;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    timestamp?: string;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Error types
export interface ErrorDetails {
  field?: string;
  value?: string | number;
  constraint?: string;
  context?: string;
  [key: string]: unknown;
}

export interface TypedError {
  message: string;
  code?: string;
  details?: ErrorDetails;
  stack?: string;
}

// Form state types
export interface FormState<T> {
  data: T;
  errors: Partial<Record<keyof T, string>>;
  isSubmitting: boolean;
  isDirty: boolean;
  isValid: boolean;
}

// Loading states
export interface LoadingState {
  isLoading: boolean;
  error: string | null;
  lastUpdated?: Date;
}

// Component props base types
export interface BaseComponentProps {
  className?: string;
  children?: React.ReactNode;
  testId?: string;
}

// Event handler types
export type AsyncEventHandler<T = void> = (event?: React.SyntheticEvent) => Promise<T>;
export type EventHandler<T = void> = (event?: React.SyntheticEvent) => T;

// CRUD operations interface
export interface CrudOperations<T, TCreate = Partial<T>, TUpdate = Partial<T>> {
  create: (data: TCreate) => Promise<T>;
  read: (id: string) => Promise<T>;
  update: (id: string, data: TUpdate) => Promise<T>;
  delete: (id: string) => Promise<void>;
  list: (params?: ListParams) => Promise<T[]>;
}

export interface ListParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  filter?: Record<string, string | number | boolean>;
  search?: string;
}

// Chat-specific types (consolidated from chat.ts)
export interface ChatMessage {
  id: string;
  content: string;
  message_type: 'user' | 'bill_agent' | 'peer_agent' | 'flow_agent';
  created_at: string;
  user_id?: string;
  agent_context?: any;
  submitted_to_ibis?: boolean;
  // Client-only transient fields for UX
  status?: 'pending' | 'failed' | 'sent' | 'streaming';
  error?: string;
  local_id?: string;
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

// Enhanced User type (from api.ts)
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

export interface Deliberation {
  id: string;
  title: string;
  description: string;
  notion?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// Auth types (consolidated from auth.ts)
export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
  refreshToken: () => Promise<void>;
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
}

export interface TokenPayload {
  sub: string;
  exp: number;
  iat: number;
}

// Performance monitoring types
export interface PerformanceMetrics {
  renderTime: number;
  memoryUsage: number;
  componentName: string;
  timestamp: number;
}

// Hook optimization types
export interface OptimizedStateConfig<T> {
  enableMemoryOptimization?: boolean;
  compareFunction?: (prev: T, next: T) => boolean;
  debugMode?: boolean;
}

// Security context
export interface SecurityContext {
  isSecure: boolean;
  permissions: string[];
  sessionId: string;
  csrfToken?: string;
  fingerprint?: string;
}

// Theme and styling
export interface ThemeVariant {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
  muted: string;
  border: string;
}

// User preferences
export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  notifications: boolean;
  autoSave: boolean;
  debugMode: boolean;
}

// Request context for API calls
export interface RequestConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  retries?: number;
}

export interface RequestContext {
  url: string;
  config: RequestConfig;
  attempt: number;
  startTime: number;
}

// Data fetching states
export interface DataState<T> {
  data: T | null;
  isLoading: boolean;
  error: TypedError | null;
  lastFetch?: Date;
  isStale: boolean;
}

// Configuration objects
export interface ConfigOption<T = string> {
  value: T;
  label: string;
  disabled?: boolean;
  description?: string;
}

// Validation types
export interface ValidationRule<T> {
  validate: (value: T) => boolean;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}