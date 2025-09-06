import { useState, useEffect, useCallback, useMemo } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

interface OptimizedAuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAdmin: boolean;
}

// Optimized auth hook with minimal rerenders
export const useOptimizedAuth = () => {
  const [authState, setAuthState] = useState<OptimizedAuthState>({
    user: null,
    session: null,
    isLoading: true,
    isAdmin: false
  });

  // Stable callback for checking admin status
  const checkAdminStatus = useCallback(async (userId: string, userEmail?: string) => {
    try {
      // Simple email-based admin check (no database required)
      const isAdminUser = userEmail === 'ADMIN@deliberation.local' || 
                         userEmail === 'SUPER@deliberation.local';
      return isAdminUser;
    } catch (error) {
      logger.error('Error checking admin status:', error);
      return false;
    }
  }, []);

  // Single effect for auth state management
  useEffect(() => {
    let mounted = true;

    // Auth state change handler
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        logger.info('Auth state changed', { event, userId: session?.user?.id });
        
        // Batch state updates to prevent multiple rerenders
        if (session?.user) {
          // First update with user and session
          setAuthState(prev => ({
            ...prev,
            session,
            user: session.user,
            isLoading: false
          }));

          // Then update admin status asynchronously
          checkAdminStatus(session.user.id, session.user.email).then(isAdmin => {
            if (mounted) {
              setAuthState(prev => ({ ...prev, isAdmin }));
            }
          });
        } else {
          setAuthState({
            user: null,
            session: null,
            isLoading: false,
            isAdmin: false
          });
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;

      if (session?.user) {
        setAuthState(prev => ({
          ...prev,
          session,
          user: session.user,
          isLoading: false
        }));

        checkAdminStatus(session.user.id, session.user.email).then(isAdmin => {
          if (mounted) {
            setAuthState(prev => ({ ...prev, isAdmin }));
          }
        });
      } else {
        setAuthState(prev => ({ ...prev, isLoading: false }));
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [checkAdminStatus]);

  // Stable auth methods
  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error };
    } catch (error) {
      logger.error('Sign in error:', error);
      return { error };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut({
        scope: 'local'
      });
      if (!error) {
        setAuthState({
          user: null,
          session: null,
          isLoading: false,
          isAdmin: false
        });
      }
      return { error };
    } catch (error) {
      logger.error('Sign out error:', error);
      return { error };
    }
  }, []);

  return useMemo(() => ({
    ...authState,
    signIn,
    signOut
  }), [authState, signIn, signOut]);
};