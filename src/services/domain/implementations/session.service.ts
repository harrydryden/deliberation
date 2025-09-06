import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

export interface UserSession {
  id: string;
  user_id: string;
  session_token_hash: string;
  created_at: string;
  last_active: string;
  expires_at: string;
  is_active: boolean;
}

export interface SessionMetrics {
  totalSessions: number;
  activeSessions: number;
  averageSessionDuration: number;
  lastSessionAt?: string;
}

export class SessionService {
  async createSession(userId: string, sessionData: {
    sessionTokenHash: string;
  }): Promise<UserSession | null> {
    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .insert({
          user_id: userId,
          session_token_hash: sessionData.sessionTokenHash,
          is_active: true
        })
        .select()
        .single();

      if (error) {
        logger.error('Failed to create session', { error, userId });
        return null;
      }

      logger.info('Session created', { sessionId: data.id, userId });
      return data;
    } catch (error) {
      logger.error('Session creation error', { error, userId });
      return null;
    }
  }

  async updateSessionActivity(sessionId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_sessions')
        .update({ 
          last_active: new Date().toISOString() 
        })
        .eq('id', sessionId)
        .eq('is_active', true);

      if (error) {
        logger.error('Failed to update session activity', { error, sessionId });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Session activity update error', { error, sessionId });
      return false;
    }
  }

  async endSession(sessionId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_sessions')
        .update({ 
          is_active: false,
          last_active: new Date().toISOString()
        })
        .eq('id', sessionId);

      if (error) {
        logger.error('Failed to end session', { error, sessionId });
        return false;
      }

      logger.info('Session ended', { sessionId });
      return true;
    } catch (error) {
      logger.error('Session end error', { error, sessionId });
      return false;
    }
  }

  async getUserSessions(userId: string, includeInactive = false): Promise<UserSession[]> {
    try {
      let query = supabase
        .from('user_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!includeInactive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Failed to get user sessions', { error, userId });
        return [];
      }

      return data || [];
    } catch (error) {
      logger.error('Get user sessions error', { error, userId });
      return [];
    }
  }

  async getUserSessionMetrics(userId: string): Promise<SessionMetrics> {
    try {
      const sessions = await this.getUserSessions(userId, true);
      
      const totalSessions = sessions.length;
      const activeSessions = sessions.filter(s => s.is_active).length;
      
      // Calculate average session duration for completed sessions
      const completedSessions = sessions.filter(s => !s.is_active);
      let averageSessionDuration = 0;
      
      if (completedSessions.length > 0) {
        const totalDuration = completedSessions.reduce((total, session) => {
          const start = new Date(session.created_at).getTime();
          const end = new Date(session.last_active).getTime();
          return total + (end - start);
        }, 0);
        
        averageSessionDuration = totalDuration / completedSessions.length;
      }

      const lastSessionAt = sessions.length > 0 ? sessions[0].created_at : undefined;

      return {
        totalSessions,
        activeSessions,
        averageSessionDuration: Math.round(averageSessionDuration / 1000), // Convert to seconds
        lastSessionAt
      };
    } catch (error) {
      logger.error('Get session metrics error', { error, userId });
      return {
        totalSessions: 0,
        activeSessions: 0,
        averageSessionDuration: 0
      };
    }
  }

  async cleanupExpiredSessions(): Promise<number> {
    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .update({ is_active: false })
        .lt('expires_at', new Date().toISOString())
        .eq('is_active', true)
        .select('id');

      if (error) {
        logger.error('Failed to cleanup expired sessions', { error });
        return 0;
      }

      const cleanedCount = data?.length || 0;
      if (cleanedCount > 0) {
        logger.info('Cleaned up expired sessions', { count: cleanedCount });
      }

      return cleanedCount;
    } catch (error) {
      logger.error('Session cleanup error', { error });
      return 0;
    }
  }
}

export const sessionService = new SessionService();