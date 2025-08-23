import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils';
import { AuthProvider, useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { supabase } from '@/integrations/supabase/client';

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      signUp: vi.fn(),
      setSession: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      upsert: vi.fn(() => Promise.resolve({ error: null })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
    })),
  },
}));

const TestComponent = () => {
  const { user, isAdmin, isLoading } = useSupabaseAuth();
  
  if (isLoading) return <div>Loading...</div>;
  
  return (
    <div>
      <div data-testid="user-status">{user ? 'authenticated' : 'not authenticated'}</div>
      <div data-testid="admin-status">{isAdmin ? 'admin' : 'not admin'}</div>
    </div>
  );
};

describe('Authentication Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with no user', async () => {
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: null } });
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-status')).toHaveTextContent('not authenticated');
      expect(screen.getByTestId('admin-status')).toHaveTextContent('not admin');
    });
  });

  it('handles sign in flow', async () => {
    const mockUser = { id: 'test-user', email: 'test@example.com' };
    const mockSession = { user: mockUser, access_token: 'token', refresh_token: 'refresh' };
    
    (supabase.auth.signInWithPassword as any).mockResolvedValue({ error: null });
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn(() => Promise.resolve({ data: [{ role: 'admin' }], error: null })),
      upsert: vi.fn(() => Promise.resolve({ error: null })),
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Simulate auth state change
    const authStateCallback = (supabase.auth.onAuthStateChange as any).mock.calls[0][0];
    authStateCallback('SIGNED_IN', mockSession);

    await waitFor(() => {
      expect(screen.getByTestId('user-status')).toHaveTextContent('authenticated');
    });
  });
});