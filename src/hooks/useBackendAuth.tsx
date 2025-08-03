import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { User } from '@/types/api';
import { AuthContextType } from '@/types/auth';
import { backendServiceFactory } from '@/services/backend/factory';
import { BACKEND_CONFIG } from '@/config/backend';
import { supabase } from '@/integrations/supabase/client';
import { userCache } from '@/utils/validation';
import { logger } from '@/utils/logger';
import { useOptimizedBoolean } from '@/hooks/useOptimizedState';
import { useMemoryLeakDetection } from '@/utils/performanceUtils';

// Create context with a default value to prevent undefined errors
const defaultAuthContext: AuthContextType = {
  user: null,
  isLoading: true,
  authenticate: async () => { throw new Error('Auth not initialized'); },
  signOut: async () => { throw new Error('Auth not initialized'); },
  isAuthenticated: false,
  refreshToken: async () => { throw new Error('Auth not initialized'); },
};

const AuthContext = createContext<AuthContextType>(defaultAuthContext);

interface BackendAuthProviderProps {
  children: ReactNode;
}

export const BackendAuthProvider = ({ children }: BackendAuthProviderProps) => {
  useMemoryLeakDetection('BackendAuthProvider');
  
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useOptimizedBoolean(true);
  const [isInitialized, setIsInitialized] = useOptimizedBoolean(false);
  const [authInProgress, setAuthInProgress] = useOptimizedBoolean(false);

  // Get auth service safely
  const authService = React.useMemo(() => {
    try {
      return backendServiceFactory.getAuthService();
    } catch (error) {
      logger.error('Failed to get auth service', error);
      return null;
    }
  }, []);

  const initializeAuth = useCallback(async () => {
    if (isInitialized || authInProgress || !authService) {
      logger.auth.progress('Auth already initialized or in progress, or no auth service, skipping');
      return;
    }

    setAuthInProgress(true);
    logger.auth.start('Initializing auth...');

    try {
      if (authService.hasValidToken()) {
        logger.auth.info('Valid token found, getting current user...');
        const currentUser = await authService.getCurrentUser();
        setUser(currentUser);
        logger.auth.success('Auth initialized successfully with user', { userId: currentUser.id });
      } else {
        logger.auth.info('No valid token found');
        setUser(null);
      }
    } catch (error) {
      logger.auth.failure('Failed to initialize auth', error);
      if (authService) {
        authService.setToken(null);
      }
      setUser(null);
    } finally {
      setIsLoading(false);
      setIsInitialized(true);
      setAuthInProgress(false);
      logger.auth.complete('Auth initialization completed');
    }
  }, [authService, isInitialized, authInProgress]);

  const authenticate = useCallback(async (accessCode: string) => {
    if (!authService) {
      throw new Error('Auth service not available');
    }
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
      if (authService) {
        await authService.signOut();
      }
      // Clear all cached user data for performance
      userCache.clear();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [authService]);

  const refreshToken = useCallback(async () => {
    if (!authService) {
      throw new Error('Auth service not available');
    }
    try {
      const { user: refreshedUser, token } = await authService.refreshToken();
      authService.setToken(token);
      setUser(refreshedUser);
    } catch (error) {
      logger.auth.failure('Token refresh failed', error);
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
    if (BACKEND_CONFIG.type === 'supabase' && authService) {
      
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event: string, session: any) => {
          logger.auth.info('Auth state change', { event, hasSession: !!session });
           
          // Prevent processing if already in progress to avoid race conditions
          if (authInProgress && event !== 'SIGNED_OUT') {
            logger.auth.warning('Auth in progress, skipping event', { event });
            return;
          }

          // Handle sign out events
          if (event === 'SIGNED_OUT' || !session) {
            logger.auth.info('Signing out user');
            setUser(null);
            setIsLoading(false);
            setIsInitialized(true);
            return;
          }

          // Handle sign in and token refresh events
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            logger.auth.progress('Processing auth event', { event });
            setAuthInProgress(true);
            
            // Add timeout protection
            const timeoutId = setTimeout(() => {
              logger.auth.timeout('Auth timeout - forcing loading to false');
              setIsLoading(false);
              setAuthInProgress(false);
            }, 10000); // 10 second timeout

            Promise.resolve().then(async () => {
              try {
                logger.auth.info('Processing auth event with session', { event, hasSession: !!session });
                if (authService) {
                  const currentUser = await authService.getCurrentUser();
                  logger.auth.success('Current user retrieved', { userId: currentUser?.id });
                  setUser(currentUser);
                  logger.auth.success('Auth state updated successfully');
                }
              } catch (error) {
                logger.auth.failure('Failed to get current user', error);
                setUser(null);
              } finally {
                clearTimeout(timeoutId);
                setIsLoading(false);
                setIsInitialized(true);
                setAuthInProgress(false);
                logger.auth.complete('Auth state change completed');
              }
            });
          }
        }
      );

      return () => subscription.unsubscribe();
    }
  }, [authService, authInProgress]);

  const value: AuthContextType = {
    user,
    isLoading: authService ? isLoading : false, // If no auth service, don't show loading
    authenticate,
    signOut,
    isAuthenticated: !!user,
    refreshToken,
  };

  // Always provide context, even if auth service fails
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useBackendAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  // Context now always has a value due to default, so no need to check for undefined
  return context;
};