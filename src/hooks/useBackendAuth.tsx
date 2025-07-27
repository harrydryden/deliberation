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
  const [isInitialized, setIsInitialized] = useState(false);
  const [authInProgress, setAuthInProgress] = useState(false);

  const authService = backendServiceFactory.getAuthService();

  const initializeAuth = useCallback(async () => {
    if (isInitialized || authInProgress) {
      console.log('🔄 Auth already initialized or in progress, skipping');
      return;
    }

    setAuthInProgress(true);
    console.log('🚀 Initializing auth...');

    try {
      if (authService.hasValidToken()) {
        console.log('🔑 Valid token found, getting current user...');
        const currentUser = await authService.getCurrentUser();
        setUser(currentUser);
        console.log('✅ Auth initialized successfully with user:', currentUser.id);
      } else {
        console.log('🔑 No valid token found');
        setUser(null);
      }
    } catch (error) {
      console.error('❌ Failed to initialize auth:', error);
      authService.setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
      setIsInitialized(true);
      setAuthInProgress(false);
      console.log('🎯 Auth initialization completed');
    }
  }, [authService, isInitialized, authInProgress]);

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

  // No longer need Supabase auth state listener since we're using custom session management

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