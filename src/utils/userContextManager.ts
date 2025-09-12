import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

interface UserContextInfo {
  userId: string;
  isAdmin: boolean;
  sessionId?: string;
  isParticipant?: boolean;
  deliberationId?: string;
}

interface CachedContext {
  context: UserContextInfo;
  timestamp: number;
  expiresAt: number;
}

/**
 * Centralized User Context Manager
 * Singleton pattern to prevent race conditions and ensure consistent user context
 */
export class UserContextManager {
  private static instance: UserContextManager;
  private contextCache = new Map<string, CachedContext>();
  private activePromises = new Map<string, Promise<UserContextInfo>>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  
  private constructor() {}
  
  static getInstance(): UserContextManager {
    if (!UserContextManager.instance) {
      UserContextManager.instance = new UserContextManager();
    }
    return UserContextManager.instance;
  }
  
  /**
   * Get current user context with validation and caching
   */
  async getCurrentUserContext(deliberationId?: string): Promise<UserContextInfo> {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      throw new Error('User not authenticated');
    }
    
    const userId = session.user.id;
    const cacheKey = `${userId}:${deliberationId || 'global'}`;
    
    // Check cache first
    const cached = this.contextCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      logger.debug('Using cached user context', { userId: userId.substring(0, 8), deliberationId });
      return cached.context;
    }
    
    // Prevent duplicate requests with promise deduplication
    if (this.activePromises.has(cacheKey)) {
      logger.debug('Reusing active user context promise', { userId: userId.substring(0, 8) });
      return this.activePromises.get(cacheKey)!;
    }
    
    const promise = this.fetchUserContext(userId, deliberationId);
    this.activePromises.set(cacheKey, promise);
    
    try {
      const context = await promise;
      
      // Cache the result
      this.contextCache.set(cacheKey, {
        context,
        timestamp: Date.now(),
        expiresAt: Date.now() + this.CACHE_DURATION
      });
      
      return context;
    } finally {
      this.activePromises.delete(cacheKey);
    }
  }
  
  /**
   * Fetch user context from database with validation
   */
  private async fetchUserContext(userId: string, deliberationId?: string): Promise<UserContextInfo> {
    try {
      // Get user profile and role
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('user_role, is_archived')
        .eq('id', userId)
        .single();
      
      if (profileError) {
        logger.error('Failed to fetch user profile', { error: profileError, userId: userId.substring(0, 8) });
        throw new Error(`User profile not found: ${profileError.message}`);
      }
      
      if (profile.is_archived) {
        throw new Error('User account is archived and cannot perform actions');
      }
      
      const isAdmin = profile.user_role === 'admin';
      let isParticipant = false;
      
      // Check deliberation participation if specified
      if (deliberationId) {
        const { data: participation, error: participationError } = await supabase
          .from('participants')
          .select('id, role')
          .eq('user_id', userId)
          .eq('deliberation_id', deliberationId)
          .single();
        
        if (participationError && participationError.code !== 'PGRST116') {
          logger.error('Failed to check deliberation participation', { 
            error: participationError, 
            userId: userId.substring(0, 8),
            deliberationId: deliberationId.substring(0, 8)
          });
          throw new Error(`Failed to verify deliberation participation: ${participationError.message}`);
        }
        
        isParticipant = !!participation;
        
        if (!isAdmin && !isParticipant) {
          throw new Error('User is not a participant in this deliberation');
        }
      }
      
      const context: UserContextInfo = {
        userId,
        isAdmin,
        isParticipant,
        deliberationId
      };
      
      logger.info('User context validated', {
        userId: userId.substring(0, 8),
        isAdmin,
        isParticipant,
        deliberationId: deliberationId?.substring(0, 8)
      });
      
      return context;
    } catch (error) {
      logger.error('User context validation failed', { 
        error, 
        userId: userId.substring(0, 8),
        deliberationId: deliberationId?.substring(0, 8)
      });
      throw error;
    }
  }
  
  /**
   * Validate user context for message creation
   */
  async validateMessageCreation(userId: string, deliberationId?: string): Promise<UserContextInfo> {
    const context = await this.getCurrentUserContext(deliberationId);
    
    if (context.userId !== userId) {
      logger.error('User ID mismatch detected', {
        providedUserId: userId.substring(0, 8),
        contextUserId: context.userId.substring(0, 8),
        deliberationId: deliberationId?.substring(0, 8)
      });
      throw new Error('User ID mismatch: session does not match provided user ID');
    }
    
    return context;
  }
  
  /**
   * Clear cache for user (useful on logout or context changes)
   */
  clearUserCache(userId: string): void {
    const keysToDelete = Array.from(this.contextCache.keys()).filter(key => key.startsWith(userId));
    keysToDelete.forEach(key => this.contextCache.delete(key));
    logger.debug('Cleared user context cache', { userId: userId.substring(0, 8), clearedKeys: keysToDelete.length });
  }
  
  /**
   * Clear all expired cache entries
   */
  cleanupExpiredCache(): void {
    const now = Date.now();
    const expiredKeys = Array.from(this.contextCache.entries())
      .filter(([, cached]) => now >= cached.expiresAt)
      .map(([key]) => key);
    
    expiredKeys.forEach(key => this.contextCache.delete(key));
    
    if (expiredKeys.length > 0) {
      logger.debug('Cleaned up expired context cache entries', { count: expiredKeys.length });
    }
  }
}

// Export singleton instance
export const userContextManager = UserContextManager.getInstance();

// Cleanup expired cache every 5 minutes
setInterval(() => {
  userContextManager.cleanupExpiredCache();
}, 5 * 60 * 1000);