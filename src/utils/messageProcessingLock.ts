/**
 * Message Processing Lock - Prevents race conditions in message handling
 * Ensures atomic operations for message creation and agent orchestration
 */

import { productionLogger } from '@/utils/productionLogger';

interface ProcessingLock {
  messageId: string;
  userId: string;
  deliberationId: string | null;
  timestamp: number;
  operation: 'creating' | 'orchestrating' | 'linking';
}

export class MessageProcessingLockManager {
  private static locks = new Map<string, ProcessingLock>();
  private static readonly LOCK_TIMEOUT_MS = 30000; // 30 seconds
  private static readonly CLEANUP_INTERVAL_MS = 60000; // 1 minute

  static {
    // Periodic cleanup of expired locks
    setInterval(() => {
      this.cleanupExpiredLocks();
    }, this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Acquire a lock for message processing
   */
  static async acquireLock(
    userId: string,
    deliberationId: string | null,
    operation: ProcessingLock['operation'],
    contentHash?: string
  ): Promise<string> {
    const lockKey = this.generateLockKey(userId, deliberationId, operation, contentHash);
    const now = Date.now();

    // Check if lock already exists and is not expired
    const existingLock = this.locks.get(lockKey);
    if (existingLock && (now - existingLock.timestamp) < this.LOCK_TIMEOUT_MS) {
      throw new Error(`Message processing already in progress: ${operation}`);
    }

    // Create new lock
    const lock: ProcessingLock = {
      messageId: crypto.randomUUID(),
      userId,
      deliberationId,
      timestamp: now,
      operation
    };

    this.locks.set(lockKey, lock);
    return lock.messageId;
  }

  /**
   * Release a specific lock
   */
  static releaseLock(
    userId: string,
    deliberationId: string | null,
    operation: ProcessingLock['operation'],
    contentHash?: string
  ): void {
    const lockKey = this.generateLockKey(userId, deliberationId, operation, contentHash);
    this.locks.delete(lockKey);
  }

  /**
   * Check if a lock exists for the given parameters
   */
  static hasLock(
    userId: string,
    deliberationId: string | null,
    operation: ProcessingLock['operation'],
    contentHash?: string
  ): boolean {
    const lockKey = this.generateLockKey(userId, deliberationId, operation, contentHash);
    const lock = this.locks.get(lockKey);
    
    if (!lock) return false;
    
    // Check if lock is expired
    const now = Date.now();
    if ((now - lock.timestamp) >= this.LOCK_TIMEOUT_MS) {
      this.locks.delete(lockKey);
      return false;
    }

    return true;
  }

  /**
   * Execute function with lock protection and timeout handling
   */
  static async executeWithLock<T>(
    userId: string,
    deliberationId: string | null,
    operation: ProcessingLock['operation'],
    fn: () => Promise<T>,
    contentHash?: string,
    timeoutMs: number = 60000 // 60 second default timeout
  ): Promise<T> {
    const lockKey = this.generateLockKey(userId, deliberationId, operation, contentHash);
    
    // Acquire lock
    const messageId = await this.acquireLock(userId, deliberationId, operation, contentHash);
    
    // Set up timeout to prevent hanging operations
    const timeoutId = setTimeout(() => {
      productionLogger.warn('Lock operation timeout, releasing lock', {
        userId,
        deliberationId,
        operation,
        timeoutMs
      });
      this.releaseLock(userId, deliberationId, operation, contentHash);
    }, timeoutMs);
    
    try {
      // Execute the function with timeout
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Operation timeout after ${timeoutMs}ms`));
          }, timeoutMs);
        })
      ]);
      
      return result;
    } catch (error) {
      productionLogger.error('Error in executeWithLock', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        deliberationId,
        operation
      });
      throw error;
    } finally {
      // Always clear timeout and release lock
      clearTimeout(timeoutId);
      this.releaseLock(userId, deliberationId, operation, contentHash);
    }
  }

  /**
   * Force release all locks for a specific user (emergency cleanup)
   */
  static forceReleaseUserLocks(userId: string): number {
    let releasedCount = 0;
    const keysToDelete: string[] = [];
    
    for (const [key, lock] of this.locks.entries()) {
      if (lock.userId === userId) {
        keysToDelete.push(key);
        releasedCount++;
      }
    }
    
    keysToDelete.forEach(key => this.locks.delete(key));
    
    if (releasedCount > 0) {
      productionLogger.info('Force released user locks', { userId, releasedCount });
    }
    
    return releasedCount;
  }

  /**
   * Generate unique lock key
   */
  private static generateLockKey(
    userId: string,
    deliberationId: string | null,
    operation: string,
    contentHash?: string
  ): string {
    const base = `${userId}:${deliberationId || 'global'}:${operation}`;
    return contentHash ? `${base}:${contentHash}` : base;
  }

  /**
   * Clean up expired locks
   */
  private static cleanupExpiredLocks(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, lock] of this.locks.entries()) {
      if ((now - lock.timestamp) >= this.LOCK_TIMEOUT_MS) {
        this.locks.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      productionLogger.info('Message processing locks cleaned up', { cleanedCount });
    }
  }

  /**
   * Get current lock statistics for monitoring
   */
  static getLockStats(): {
    totalLocks: number;
    locksByOperation: Record<string, number>;
    oldestLockAge: number;
  } {
    const now = Date.now();
    const locksByOperation: Record<string, number> = {};
    let oldestTimestamp = now;

    for (const lock of this.locks.values()) {
      locksByOperation[lock.operation] = (locksByOperation[lock.operation] || 0) + 1;
      oldestTimestamp = Math.min(oldestTimestamp, lock.timestamp);
    }

    return {
      totalLocks: this.locks.size,
      locksByOperation,
      oldestLockAge: this.locks.size > 0 ? now - oldestTimestamp : 0
    };
  }

  /**
   * Generate content hash for duplicate detection
   */
  static generateContentHash(content: string): string {
    // Simple hash function for content deduplication
    let hash = 0;
    const normalizedContent = content.trim().toLowerCase();
    
    for (let i = 0; i < normalizedContent.length; i++) {
      const char = normalizedContent.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return Math.abs(hash).toString(36);
  }
}