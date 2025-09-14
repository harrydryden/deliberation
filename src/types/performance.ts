// Enhanced type definitions for performance and reliability
export interface PerformanceMetrics {
  renderTime: number;
  apiResponseTime: number;
  cacheHitRate: number;
  memoryUsage: number;
  errorRate: number;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  hits: number;
}

export interface ErrorContext {
  component?: string;
  operation?: string;
  userId?: string;
  deliberationId?: string;
  metadata?: Record<string, any>;
}

export interface APIError {
  message: string;
  code?: string;
  status?: number;
  context?: ErrorContext;
  retryable?: boolean;
}

export interface AsyncOperationState<T> {
  loading: boolean;
  data: T | null;
  error: APIError | null;
  lastUpdated: number;
}

// Enhanced hook return types
export interface UseAsyncResult<T> {
  data: T | null;
  loading: boolean;
  error: APIError | null;
  retry: () => Promise<void>;
  reset: () => void;
}

// Component performance props
export interface OptimizedComponentProps {
  lazyLoad?: boolean;
  debounceMs?: number;
  memoize?: boolean;
  errorBoundary?: boolean;
}

// Service method signatures
export interface CRUDOperations<T> {
  findAll(filter?: Record<string, any>): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  create(data: Omit<T, 'id' | 'created_at' | 'updated_at'>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}

export interface CacheOperations<T> {
  get(key: string): T | null;
  set(key: string, value: T, ttl?: number): void;
  delete(key: string): boolean;
  clear(): void;
  getStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
  };
}

// Edge function types
export interface EdgeFunctionRequest<T = any> {
  body: T;
  headers: Headers;
  method: string;
}

export interface EdgeFunctionResponse<T = any> {
  data?: T;
  error?: APIError;
  status: number;
  headers?: Record<string, string>;
}