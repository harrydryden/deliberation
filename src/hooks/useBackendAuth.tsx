import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { User } from '@/types/api';
import { AuthContextType } from '@/types/auth';
import { backendServiceFactory } from '@/services/backend/factory';
import { BACKEND_CONFIG } from '@/config/backend';
import { supabase } from '@/integrations/supabase/client';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface BackendAuthProviderProps {
  children: ReactNode;
}

export const BackendAuthProvider = ({ children }: BackendAuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const authService = backendServiceFactory.getAuthService();

  const initializeAuth = useCallback(async () => {
    try {
      if (authService.hasValidToken()) {
        const currentUser = await authService.getCurrentUser();
        setUser(currentUser);
      }
    } catch (error) {
      console.error('Failed to initialize auth:', error);
      authService.setToken(null);
    } finally {
      setIsLoading(false);
    }
  }, [authService]);

  const authenticate = useCallback(async (accessCode: string) => {
    setIsLoading(true);
    try {
      const { user: authenticatedUser, token } = await authService.authenticate(accessCode);
      authService.setToken(token);
      setUser(authenticatedUser);
    } finally {
      setIsLoading(false);
    }
  }, [authService]);

  const signOut = useCallback(async () => {
    setIsLoading(true);
    try {
      await authService.signOut();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [authService]);

  const refreshToken = useCallback(async () => {
    try {
      const { user: refreshedUser, token } = await authService.refreshToken();
      authService.setToken(token);
      setUser(refreshedUser);
    } catch (error) {
      console.error('Token refresh failed:', error);
      await signOut();
      throw error;
    }
  }, [authService, signOut]);

  // Initialize auth on mount
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Set up Supabase auth state listener if using Supabase
  useEffect(() => {
    if (BACKEND_CONFIG.type === 'supabase') {
      
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event: string, session: any) => {
          console.log('🔄 Auth state change:', event, session ? 'with session' : 'no session');
          
          if (event === 'SIGNED_OUT' || !session) {
            console.log('🚪 Signing out user');
            setUser(null);
            setIsLoading(false);
          } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            try {
              console.log('🔐 Auth event:', event, 'Session:', session);
              const currentUser = await authService.getCurrentUser();
              console.log('👤 Current user retrieved:', currentUser);
              setUser(currentUser);
            } catch (error) {
              console.error('❌ Failed to get current user:', error);
              console.error('❌ Error details:', error);
              setUser(null);
            }
            setIsLoading(false);
          }
        }
      );

      return () => subscription.unsubscribe();
    }
  }, [authService]);

  const value: AuthContextType = {
    user,
    isLoading,
    authenticate,
    signOut,
    isAuthenticated: !!user,
    refreshToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useBackendAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useBackendAuth must be used within a BackendAuthProvider');
  }
  return context;
};