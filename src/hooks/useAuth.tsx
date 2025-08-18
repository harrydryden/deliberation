import React, { createContext, useContext, useState, ReactNode } from 'react';
import { User } from '@/types/api';
import { supabase } from '@/integrations/supabase/client';

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
        const parsedUser = JSON.parse(storedUser);
        // Check if this is an old user object with access_ prefix ID
        if (parsedUser.id && parsedUser.id.startsWith('access_')) {
          console.log('Found old user format, clearing localStorage for re-authentication');
          localStorage.removeItem('simple_auth_user');
        } else {
          setUser(parsedUser);
        }
      } catch (error) {
        console.warn('Failed to parse stored user:', error);
        localStorage.removeItem('simple_auth_user');
      }
    }
  }, []);

  const authenticateWithAccessCode = async (accessCode: string, userRole: string) => {
    setIsLoading(true);
    
    try {
      // First, validate the access code
      const { data: validationData, error: validationError } = await supabase.rpc('validate_access_code_simple', {
        input_code: accessCode.toUpperCase()
      });

      if (validationError) throw validationError;
      if (!validationData?.valid) throw new Error('Invalid access code');

      // Get the actual user UUID from the access_codes table
      const { data: accessCodeData, error: accessCodeError } = await supabase
        .from('access_codes')
        .select('used_by, code_type')
        .eq('code', accessCode.toUpperCase())
        .eq('is_active', true)
        .eq('is_used', true)
        .single();

      if (accessCodeError || !accessCodeData?.used_by) {
        throw new Error('Unable to find user associated with access code');
      }

      // Create user object for the auth context using the proper UUID
      const simpleUser: User = {
        id: accessCodeData.used_by, // This is the actual UUID
        accessCode: accessCode,
        role: accessCodeData.code_type, // Use the role from the access code
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
    } catch (error) {
      console.error('Authentication failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
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