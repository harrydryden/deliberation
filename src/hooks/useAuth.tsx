import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useServices } from '@/hooks/useServices';
import { User } from '@/types/api';

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ user: User; session: any }>;
  register: (email: string, password: string, accessCode?: string) => Promise<{ user: User; session: any }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

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

  const logout = async () => {
    await authService.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

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
