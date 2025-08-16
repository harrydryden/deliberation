import React, { createContext, useContext, useState, ReactNode } from 'react';
import { User } from '@/types/api';

/**
 * Authentication context type definition
 * 
 * Provides the shape of the authentication context with user state,
 * loading state, and authentication methods for simple access code authentication.
 */
export interface AuthContextType {
  /** Current authenticated user or null if not authenticated */
  user: User | null;
  /** Loading state for authentication operations */
  isLoading: boolean;
  /** Access code authentication function */
  authenticateWithAccessCode: (accessCode: string, userRole: string) => Promise<void>;
  /** Logout function that signs out the current user */
  logout: () => Promise<void>;
  /** Whether the user is currently authenticated */
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Simple Authentication Provider Component
 * 
 * Provides authentication context to the entire application using
 * simple access code authentication instead of traditional email/password.
 * 
 * @param children - React children to wrap with authentication context
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Initialize from localStorage on mount
  React.useEffect(() => {
    const storedUser = localStorage.getItem('simple_auth_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.warn('Failed to parse stored user:', error);
        localStorage.removeItem('simple_auth_user');
      }
    }
  }, []);

  const authenticateWithAccessCode = async (accessCode: string, userRole: string) => {
    // Create a simple user for access code authentication
    const simpleUser: User = {
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
    
    // Persist to localStorage
    localStorage.setItem('simple_auth_user', JSON.stringify(simpleUser));
    setUser(simpleUser);
  };

  const logout = async () => {
    localStorage.removeItem('simple_auth_user');
    setUser(null);
  };

  const value = {
    user,
    isLoading,
    authenticateWithAccessCode,
    logout,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
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
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};