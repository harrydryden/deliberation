import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

interface AccessCodeUser {
  id: string;
  accessCode: string;
  role: string;
}

/**
 * Centralized User Context Manager
 * Handles all user context setting throughout the application
 * Prevents race conditions and provides consistent error handling
 */
class UserContextManager {
  private static instance: UserContextManager;
  private contextPromise: Promise<boolean> | null = null;
  private lastSetUserId: string | null = null;
  private contextCache: Map<string, { timestamp: number; verified: boolean }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  static getInstance(): UserContextManager {
    if (!UserContextManager.instance) {
      UserContextManager.instance = new UserContextManager();
    }
    return UserContextManager.instance;
  }

  /**
   * Ensures user context is set for the current user
   * Reuses existing promises to prevent race conditions
   */
  async ensureUserContext(userId?: string): Promise<boolean> {
    try {
      const targetUserId = userId || this.getCurrentUserId();
      if (!targetUserId) {
        logger.warn('No user ID available for context setting');
        return false;
      }

      // Check cache first
      const cached = this.contextCache.get(targetUserId);
      if (cached && (Date.now() - cached.timestamp) < this.CACHE_DURATION && cached.verified) {
        logger.debug('Using cached user context', { userId: targetUserId });
        return true;
      }

      // If we already have a context promise for this user, reuse it
      if (this.contextPromise && this.lastSetUserId === targetUserId) {
        try {
          return await this.contextPromise;
        } catch (error) {
          // Clear failed promise and try again
          this.contextPromise = null;
          this.lastSetUserId = null;
          this.contextCache.delete(targetUserId);
        }
      }

      // Create new context setting promise
      this.lastSetUserId = targetUserId;
      this.contextPromise = this.performContextSetting(targetUserId);
      
      try {
        const result = await this.contextPromise;
        
        // Cache the result
        this.contextCache.set(targetUserId, {
          timestamp: Date.now(),
          verified: result
        });
        
        // Clear the promise after successful completion
        setTimeout(() => {
          if (this.lastSetUserId === targetUserId) {
            this.contextPromise = null;
            this.lastSetUserId = null;
          }
        }, 1000);
        
        return result;
      } catch (error) {
        logger.error('Context setting failed', error);
        this.contextPromise = null;
        this.lastSetUserId = null;
        this.contextCache.delete(targetUserId);
        return false;
      }
    } catch (error) {
      logger.error('Fatal error in ensureUserContext', error);
      return false;
    }
  }

  /**
   * Performs the actual context setting with retry logic
   */
  private async performContextSetting(userId: string): Promise<boolean> {
    try {
      logger.debug('Setting user context for RLS', { userId });
      
      // Get the current user to access the access code
      const user = this.getCurrentUser();
      
      // Try up to 3 times to set the context properly
      let attempts = 3;
      while (attempts > 0) {
        try {
          // Set both user ID and access code context
          const [userIdResult, accessCodeResult] = await Promise.all([
            // Set the user context
            supabase.rpc('set_config', {
              setting_name: 'app.current_user_id',
              new_value: userId,
              is_local: false
            }),
            // Set the access code context if available
            user?.accessCode ? supabase.rpc('set_config', {
              setting_name: 'app.current_access_code',
              new_value: user.accessCode,
              is_local: false
            }) : Promise.resolve({ error: null })
          ]);

          if (userIdResult.error) {
            logger.error('Failed to set user context', userIdResult.error);
            attempts--;
            if (attempts > 0) await new Promise(resolve => setTimeout(resolve, 100));
            continue;
          }

          if (accessCodeResult.error && user?.accessCode) {
            logger.warn('Failed to set access code context', accessCodeResult.error);
            // Don't fail for access code errors, but log them
          }

          // Small delay to ensure the setting takes effect
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Verify it was set correctly (only on last attempt to reduce overhead)
          if (attempts === 1) {
            const { data: debugData, error: debugError } = await supabase.rpc('debug_current_user_settings');
            
            if (debugError) {
              logger.error('Failed to verify user context', debugError);
              return false;
            }

            const isCorrect = debugData?.config_value === userId && !debugData?.config_is_null;
            
            if (!isCorrect) {
              logger.warn('User context verification failed', { 
                expected: userId, 
                actual: debugData?.config_value,
                isNull: debugData?.config_is_null 
              });
              return false;
            }
          }

          logger.debug('User context successfully set', { userId, attempts: 4 - attempts });
          return true;
        } catch (error) {
          logger.error('Error in context setting attempt', error);
          attempts--;
          if (attempts > 0) await new Promise(resolve => setTimeout(resolve, 100 * (4 - attempts)));
        }
      }
      
      logger.error('Failed to set user context after all attempts', { userId });
      return false;
    } catch (error) {
      logger.error('Error in performContextSetting', error);
      return false;
    }
  }

  /**
   * Gets the current user ID from localStorage
   */
  private getCurrentUserId(): string | null {
    try {
      const storedUser = localStorage.getItem('simple_auth_user');
      if (!storedUser) return null;
      
      const user: AccessCodeUser = JSON.parse(storedUser);
      return user?.id || null;
    } catch (error) {
      logger.error('Error getting current user ID', error);
      return null;
    }
  }

  /**
   * Gets the current user object
   */
  getCurrentUser(): AccessCodeUser | null {
    try {
      const storedUser = localStorage.getItem('simple_auth_user');
      if (!storedUser) return null;
      
      return JSON.parse(storedUser) as AccessCodeUser;
    } catch (error) {
      logger.error('Error getting current user', error);
      return null;
    }
  }

  /**
   * Clears the context cache for a user (useful for logout)
   */
  clearContextCache(userId?: string): void {
    if (userId) {
      this.contextCache.delete(userId);
    } else {
      this.contextCache.clear();
    }
    this.contextPromise = null;
    this.lastSetUserId = null;
  }

  /**
   * Force refresh context for current user
   */
  async refreshContext(userId?: string): Promise<boolean> {
    const targetUserId = userId || this.getCurrentUserId();
    if (targetUserId) {
      this.clearContextCache(targetUserId);
    }
    return this.ensureUserContext(targetUserId || undefined);
  }
}

// Export singleton instance
export const userContextManager = UserContextManager.getInstance();

// Helper function for admin operations
export const ensureAdminContext = async (): Promise<boolean> => {
  const user = userContextManager.getCurrentUser();
  if (!user || user.role !== 'admin') {
    console.warn('Admin context required but user is not admin');
    return false;
  }
  return await userContextManager.ensureUserContext(user.id);
};

// Legacy compatibility functions
export const ensureUserContext = () => userContextManager.ensureUserContext();
export const getCurrentUser = () => userContextManager.getCurrentUser();