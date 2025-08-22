import { ApiError } from '@/types/index';

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export function handleApiError(error: any): ApiError {
  if (error instanceof Response) {
    return {
      message: error.statusText || 'API request failed',
      status: error.status,
    };
  }
  
  if (error instanceof Error) {
    return {
      message: error.message,
      status: 500,
    };
  }
  
  return {
    message: 'Unknown error occurred',
    status: 500,
  };
}

export function isAuthError(error: any): boolean {
  return error instanceof AuthenticationError || 
         (error instanceof Error && error.message.includes('authentication'));
}

export function getErrorMessage(error: any): string {
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  if (error?.message) {
    return error.message;
  }
  
  return 'An unexpected error occurred';
}