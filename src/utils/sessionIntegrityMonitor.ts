import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';
import { MessageAuditLogger } from '@/utils/messageAuditLogger';

/**
 * Session Integrity Monitor
 * Monitors for session changes and user context inconsistencies
 */
export class SessionIntegrityMonitor {
  private static instance: SessionIntegrityMonitor;
  private currentUserId: string | null = null;
  private sessionChangeListeners: (() => void)[] = [];
  
  private constructor() {
    this.initializeMonitoring();
  }
  
  static getInstance(): SessionIntegrityMonitor {
    if (!SessionIntegrityMonitor.instance) {
      SessionIntegrityMonitor.instance = new SessionIntegrityMonitor();
    }
    return SessionIntegrityMonitor.instance;
  }
  
  private initializeMonitoring(): void {
    // Monitor auth state changes
    supabase.auth.onAuthStateChange((event, session) => {
      const newUserId = session?.user?.id || null;
      
      if (this.currentUserId && newUserId && this.currentUserId !== newUserId) {
        this.handleUserChange(this.currentUserId, newUserId, event);
      }
      
      this.currentUserId = newUserId;
      
      // Notify listeners of session changes
      this.sessionChangeListeners.forEach(listener => {
        try {
          listener();
        } catch (error) {
          logger.error('Session change listener error', { error });
        }
      });
    });
  }
  
  private async handleUserChange(oldUserId: string, newUserId: string, event: string): Promise<void> {
    logger.warn(' Session user change detected', {
      event,
      oldUserId: oldUserId.substring(0, 8),
      newUserId: newUserId.substring(0, 8),
      timestamp: new Date().toISOString()
    });
    
    // Log this as a potential security concern
    await MessageAuditLogger.logUserMismatchDetected(oldUserId, newUserId);
    
    // Clear any cached user context for the old user
    const { userContextManager } = await import('@/utils/userContextManager');
    userContextManager.clearUserCache(oldUserId);
  }
  
  /**
   * Add a listener for session changes
   */
  addSessionChangeListener(listener: () => void): void {
    this.sessionChangeListeners.push(listener);
  }
  
  /**
   * Remove a session change listener
   */
  removeSessionChangeListener(listener: () => void): void {
    const index = this.sessionChangeListeners.indexOf(listener);
    if (index > -1) {
      this.sessionChangeListeners.splice(index, 1);
    }
  }
  
  /**
   * Get current session user ID
   */
  getCurrentUserId(): string | null {
    return this.currentUserId;
  }
  
  /**
   * Validate that current session matches expected user
   */
  async validateCurrentUser(expectedUserId: string): Promise<boolean> {
    const { data: { session } } = await supabase.auth.getSession();
    const currentUserId = session?.user?.id;
    
    if (!currentUserId) {
      logger.warn('No current session found during user validation', {
        expectedUserId: expectedUserId.substring(0, 8)
      });
      return false;
    }
    
    if (currentUserId !== expectedUserId) {
      logger.error('Session user validation failed', {
        expectedUserId: expectedUserId.substring(0, 8),
        currentUserId: currentUserId.substring(0, 8)
      });
      
      await MessageAuditLogger.logUserMismatchDetected(expectedUserId, currentUserId);
      return false;
    }
    
    return true;
  }
}

// Export singleton instance
export const sessionIntegrityMonitor = SessionIntegrityMonitor.getInstance();