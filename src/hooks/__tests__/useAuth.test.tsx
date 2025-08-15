import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth, AuthProvider, type AuthContextType } from '../useAuth';
import React from 'react';

// Mock Supabase client
const mockSupabase = {
  auth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  },
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(),
      })),
    })),
  })),
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: mockSupabase,
}));

describe('useAuth', () => {
  let queryClient: QueryClient;
  
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    
    vi.clearAllMocks();
    
    // Mock session
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    
    mockSupabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it('provides auth context', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    
    expect(result.current).toMatchObject({
      user: null,
      isLoading: expect.any(Boolean),
      login: expect.any(Function),
      register: expect.any(Function),
      logout: expect.any(Function),
    });
  });

  it('handles sign in', async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-id', email: 'test@example.com' } },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    
    const signInResult = await result.current.login('test@example.com', 'password');
    
    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password',
    });
    expect(signInResult.user).toBeDefined();
  });

  it('handles sign up', async () => {
    mockSupabase.auth.signUp.mockResolvedValue({
      data: { user: { id: 'user-id', email: 'test@example.com' } },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    
    const signUpResult = await result.current.register('test@example.com', 'password');
    
    expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password',
    });
    expect(signUpResult.user).toBeDefined();
  });

  it('handles sign out', async () => {
    mockSupabase.auth.signOut.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    
    await result.current.logout();
    
    expect(mockSupabase.auth.signOut).toHaveBeenCalled();
  });

  it('handles auth errors', async () => {
    const error = new Error('Auth error');
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    
    await expect(result.current.login('test@example.com', 'password')).rejects.toThrow();
  });
});