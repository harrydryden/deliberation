import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from './useSupabaseAuth';
import { logger } from '@/utils/logger';

interface LoginMetrics {
  totalLogins: number;
  loginsThisMonth: number;
}

interface UseLoginCounterReturn {
  loginMetrics: LoginMetrics | null;
  isTracking: boolean;
}

export const useLoginCounter = (): UseLoginCounterReturn => {
  const { user } = useSupabaseAuth();
  const [loginMetrics, setLoginMetrics] = useState<LoginMetrics | null>(null);
  const [isTracking, setIsTracking] = useState(false);

  // Record login event when user signs in - set up listener on mount
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        try {
          setIsTracking(true);
          
          // Insert login event
          await supabase
            .from('login_events')
            .insert({
              user_id: session.user.id,
              login_at: new Date().toISOString()
            });

          // Refresh metrics after login
          await loadLoginMetrics(session.user.id);
        } catch (error) {
          logger.error('Error recording login event', error);
        } finally {
          setIsTracking(false);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []); // Remove user dependency to ensure listener is always active

  // Load login metrics
  const loadLoginMetrics = async (userId: string) => {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Get total logins
      const { count: totalLogins, error: totalError } = await supabase
        .from('login_events')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (totalError) throw totalError;

      // Get logins this month
      const { count: loginsThisMonth, error: monthError } = await supabase
        .from('login_events')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('login_at', startOfMonth.toISOString());

      if (monthError) throw monthError;

      setLoginMetrics({
        totalLogins: totalLogins || 0,
        loginsThisMonth: loginsThisMonth || 0
      });
    } catch (error) {
      logger.error('Error loading login metrics', error);
      setLoginMetrics({
        totalLogins: 0,
        loginsThisMonth: 0
      });
    }
  };

  // Load initial metrics when user is available
  useEffect(() => {
    if (user?.id) {
      loadLoginMetrics(user.id);
    } else {
      setLoginMetrics(null);
    }
  }, [user?.id]);

  return {
    loginMetrics,
    isTracking
  };
};