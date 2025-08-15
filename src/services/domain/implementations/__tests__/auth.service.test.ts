import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../auth.service';

// Mock dependencies
const mockUserRepository = {
  findAll: vi.fn(),
  findById: vi.fn(),
  findByEmail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateRole: vi.fn(),
  delete: vi.fn(),
};

const mockAccessCodeRepository = {
  findAll: vi.fn(),
  findByCode: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  findUnused: vi.fn(),
};

const mockSupabase = {
  auth: {
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn(),
  },
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: mockSupabase,
}));

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService(mockUserRepository);
    vi.clearAllMocks();
  });

  describe('signIn', () => {
    it('should sign in user with valid credentials', async () => {
      const mockUser = { id: 'user-id', email: 'test@example.com' };
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const result = await authService.signIn('test@example.com', 'password');

      expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password',
      });
      expect(result.user).toEqual(mockUser);
    });

    it('should throw error for invalid credentials', async () => {
      const error = { message: 'Invalid credentials' };
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null },
        error,
      });

      await expect(authService.signIn('test@example.com', 'wrongpassword')).rejects.toThrow();
    });
  });

  describe('signUp', () => {
    it('should sign up user', async () => {
      const mockUser = { id: 'user-id', email: 'test@example.com' };

      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const result = await authService.signUp('test@example.com', 'password');

      expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password',
      });
      expect(result.user).toEqual(mockUser);
    });

    it('should throw error for sign up failure', async () => {
      const error = { message: 'Sign up failed' };
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: null },
        error,
      });

      await expect(authService.signUp('test@example.com', 'password')).rejects.toThrow();
    });
  });

  describe('signOut', () => {
    it('should sign out user', async () => {
      mockSupabase.auth.signOut.mockResolvedValue({ error: null });

      await authService.signOut();

      expect(mockSupabase.auth.signOut).toHaveBeenCalled();
    });
  });

  describe('getCurrentUser', () => {
    it('should return current user session', async () => {
      const mockSession = { user: { id: 'user-id', email: 'test@example.com' } };
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const result = await authService.getCurrentUser();

      expect(result).toEqual(mockSession);
    });

    it('should return null when no session', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const result = await authService.getCurrentUser();

      expect(result).toBeNull();
    });
  });
});