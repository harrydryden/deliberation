import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSupabaseAuth } from './useSupabaseAuth';
import { sessionService, type UserSession, type SessionMetrics } from '@/services/domain/implementations/session.service';
import { logger } from '@/utils/logger';

interface UseSessionTrackingReturn {
  currentSession: UserSession | null;
  sessionMetrics: SessionMetrics | null;
  isTracking: boolean;
  updateActivity: () => void;
  endCurrentSession: () => Promise<void>;
}

export const useSessionTracking = (): UseSessionTrackingReturn => {
  const { user, session } = useSupabaseAuth();
  const [currentSession, setCurrentSession] = useState<UserSession | null>(null);
  const [sessionMetrics, setSessionMetrics] = useState<SessionMetrics | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  
  const activityTimerRef = useRef<NodeJS.Timeout>();
  const sessionRef = useRef<UserSession | null>(null);

  // Generate session token hash from Supabase session
  const generateSessionTokenHash = useCallback((supabaseSession: any): string => {
    if (!supabaseSession?.access_token) {
      return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Create a simple hash from the access token
    let hash = 0;
    const str = supabaseSession.access_token;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `session_${Math.abs(hash).toString(36)}`;
  }, []);

  // Removed browser info collection for enhanced anonymity

  // Create new session
  const createSession = useCallback(async () => {
    if (!user || !session) return;

    try {
      setIsTracking(true);
      
      const sessionTokenHash = generateSessionTokenHash(session);

      const newSession = await sessionService.createSession(user.id, {
        sessionTokenHash
      });

      if (newSession) {
        setCurrentSession(newSession);
        sessionRef.current = newSession;
        logger.info('Session tracking started', { sessionId: newSession.id });
      }
    } catch (error) {
      logger.error('Failed to create session', { error });
      setIsTracking(false);
    }
  }, [user, session, generateSessionTokenHash]);

  // Update session activity
  const updateActivity = useCallback(() => {
    if (!sessionRef.current?.id) return;

    sessionService.updateSessionActivity(sessionRef.current.id).then(success => {
      if (success) {
        // Update local session data
        setCurrentSession(prev => prev ? {
          ...prev,
          recently_active: true
        } : null);
      }
    });
  }, []);

  // End current session
  const endCurrentSession = useCallback(async () => {
    if (!sessionRef.current?.id) return;

    try {
      const success = await sessionService.endSession(sessionRef.current.id);
      if (success) {
        setCurrentSession(null);
        sessionRef.current = null;
        setIsTracking(false);
        logger.info('Session ended');
      }
    } catch (error) {
      logger.error('Failed to end session', { error });
    }
  }, []);

  // Load session metrics
  const loadSessionMetrics = useCallback(async () => {
    if (!user) return;

    try {
      const metrics = await sessionService.getUserSessionMetrics(user.id);
      setSessionMetrics(metrics);
    } catch (error) {
      logger.error('Failed to load session metrics', { error });
    }
  }, [user]);

  // Set up activity tracking
  useEffect(() => {
    if (!isTracking || !currentSession) return;

    // Update activity every 30 seconds
    const interval = setInterval(updateActivity, 30 * 1000);
    
    // Track user interactions
    const handleActivity = () => updateActivity();
    
    // Listen for various user activities
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      clearInterval(interval);
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [isTracking, currentSession, updateActivity]);

  // Handle user authentication changes
  useEffect(() => {
    if (user && session && !currentSession) {
      createSession();
      loadSessionMetrics();
    } else if (!user && currentSession) {
      endCurrentSession();
    }
  }, [user, session, currentSession, createSession, endCurrentSession, loadSessionMetrics]);

  // Handle page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentSession) {
        // Use navigator.sendBeacon for reliable session ending on page unload
        const sessionData = JSON.stringify({ sessionId: currentSession.id });
        navigator.sendBeacon('/api/end-session', sessionData);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentSession]);

  // Periodic session metrics refresh
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(loadSessionMetrics, 5 * 60 * 1000); // Every 5 minutes
    return () => clearInterval(interval);
  }, [user, loadSessionMetrics]);

  return useMemo(() => ({
    currentSession,
    sessionMetrics,
    isTracking,
    updateActivity,
    endCurrentSession
  }), [currentSession, sessionMetrics, isTracking, updateActivity, endCurrentSession]);
};