// Improved type definitions to replace 'any' usage
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

export interface AgentConfig {
  id?: string;
  agent_type: string;
  name: string;
  description?: string;
  goals?: string[];
  response_style?: string;
  is_active?: boolean;
  is_default?: boolean;
  deliberation_id?: string;
  created_by?: string;
  preset_questions?: Record<string, unknown>;
  facilitator_config?: Record<string, unknown>;
  prompt_overrides?: Record<string, unknown>;
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

// Generic form state
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

// Configuration objects
export interface ConfigOption<T = string> {
  value: T;
  label: string;
  disabled?: boolean;
  description?: string;
}

// API request/response types
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

// Generic CRUD operations
export interface ListParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  filter?: Record<string, string | number | boolean>;
  search?: string;
}

export interface CrudOperations<T, TCreate = Partial<T>, TUpdate = Partial<T>> {
  create: (data: TCreate) => Promise<T>;
  read: (id: string) => Promise<T>;
  update: (id: string, data: TUpdate) => Promise<T>;
  delete: (id: string) => Promise<void>;
  list: (params?: ListParams) => Promise<T[]>;
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
}

// Security context
export interface SecurityContext {
  isSecure: boolean;
  permissions: string[];
  sessionId: string;
  csrfToken?: string;
  fingerprint?: string;
}