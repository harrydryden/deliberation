import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useServices } from '@/hooks/useServices';
import { User } from '@/types/api';

/**
 * Authentication context type definition
 * 
 * Provides the shape of the authentication context with user state,
 * loading state, and authentication methods.
 */
export interface AuthContextType {
  /** Current authenticated user or null if not authenticated */
  user: User | null;
  /** Loading state for authentication operations */
  isLoading: boolean;
  /** Login function that authenticates a user */
  login: (email: string, password: string) => Promise<{ user: User; session: any }>;
  /** Access code authentication function */
  authenticateWithAccessCode: (accessCode: string, userRole: string) => Promise<void>;
  /** Registration function that creates a new user account */
  register: (email: string, password: string, accessCode?: string) => Promise<{ user: User; session: any }>;
  /** Logout function that signs out the current user */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Authentication Provider Component
 * 
 * Provides authentication context to the entire application.
 * Manages user state, handles authentication operations, and
 * provides authentication methods to child components.
 * 
 * @param children - React children to wrap with authentication context
 * 
 * @example
 * ```tsx
 * <AuthProvider>
 *   <App />
 * </AuthProvider>
 * ```
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const { authService } = useServices();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Initialize auth state
    const initAuth = async () => {
      try {
        const currentUser = await authService.getCurrentUser();
        setUser(currentUser);
      } catch (error) {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [authService]);

  const login = async (email: string, password: string) => {
    const result = await authService.signIn(email, password);
    if (result.session?.user) {
      setUser(result.session.user);
    }
    return result;
  };

  const register = async (email: string, password: string, accessCode?: string) => {
    const result = await authService.signUp(email, password);
    if (result.session?.user) {
      setUser(result.session.user);
    }
    return result;
  };

  const authenticateWithAccessCode = async (accessCode: string, userRole: string) => {
    // Create a mock user for access code authentication
    const mockUser: User = {
      id: `access_${accessCode}`,
      accessCode: accessCode,
      role: userRole,
      profile: {
        displayName: `User_${accessCode.substring(0, 4)}`,
        avatarUrl: '',
        bio: '',
        expertiseAreas: []
      }
    };
    setUser(mockUser);
  };

  const logout = async () => {
    await authService.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, authenticateWithAccessCode }}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Authentication hook
 * 
 * Provides access to authentication context and methods.
 * Must be used within an AuthProvider.
 * 
 * @returns Authentication context with user state and methods
 * @throws {Error} When used outside of AuthProvider
 * 
 * @example
 * ```tsx
 * const { user, login, logout, isLoading } = useAuth();
 * ```
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Keep the auth service hook for service-level operations
export const useAuthService = () => {
  const { authService } = useServices();
  return authService;
};
