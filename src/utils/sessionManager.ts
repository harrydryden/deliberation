export interface SessionMetrics {
  sessionId: string;
  createdAt: number;
  lastActivity: number;
  conversationDuration: number;
  errorCount: number;
  renewalAttempts: number;
}

export interface SessionConfig {
  maxSessionAge: number; // milliseconds
  renewalThreshold: number; // milliseconds before expiry to renew
  maxRenewalAttempts: number;
  healthCheckInterval: number;
}

export class SessionManager {
  private currentSession: SessionMetrics | null = null;
  private healthCheckTimer: number | null = null;
  private config: SessionConfig;
  private onSessionExpired?: () => void;
  private onSessionRenewed?: (sessionId: string) => void;

  constructor(
    config: Partial<SessionConfig> = {},
    callbacks: {
      onSessionExpired?: () => void;
      onSessionRenewed?: (sessionId: string) => void;
    } = {}
  ) {
    this.config = {
      maxSessionAge: 25 * 60 * 1000, // 25 minutes (5min buffer before 30min OpenAI limit)
      renewalThreshold: 5 * 60 * 1000, // Start renewal 5 minutes before expiry
      maxRenewalAttempts: 3,
      healthCheckInterval: 30 * 1000, // Check every 30 seconds
      ...config
    };
    this.onSessionExpired = callbacks.onSessionExpired;
    this.onSessionRenewed = callbacks.onSessionRenewed;
  }

  startSession(sessionId?: string): SessionMetrics {
    this.stopSession();
    
    const now = Date.now();
    this.currentSession = {
      sessionId: sessionId || `session_${now}`,
      createdAt: now,
      lastActivity: now,
      conversationDuration: 0,
      errorCount: 0,
      renewalAttempts: 0
    };

    this.startHealthCheck();
    
    console.log('[SessionManager] Session started:', {
      sessionId: this.currentSession.sessionId,
      maxAge: this.config.maxSessionAge,
      renewalThreshold: this.config.renewalThreshold
    });

    return this.currentSession;
  }

  updateActivity(): void {
    if (this.currentSession) {
      this.currentSession.lastActivity = Date.now();
      this.currentSession.conversationDuration = 
        this.currentSession.lastActivity - this.currentSession.createdAt;
    }
  }

  recordError(): void {
    if (this.currentSession) {
      this.currentSession.errorCount++;
      console.warn('[SessionManager] Error recorded:', {
        sessionId: this.currentSession.sessionId,
        errorCount: this.currentSession.errorCount
      });
    }
  }

  shouldRenewSession(): boolean {
    if (!this.currentSession) return false;
    
    const age = Date.now() - this.currentSession.createdAt;
    const timeToExpiry = this.config.maxSessionAge - age;
    
    return timeToExpiry <= this.config.renewalThreshold && 
           this.currentSession.renewalAttempts < this.config.maxRenewalAttempts;
  }

  isSessionExpired(): boolean {
    if (!this.currentSession) return true;
    
    const age = Date.now() - this.currentSession.createdAt;
    return age >= this.config.maxSessionAge;
  }

  getRemainingTime(): number {
    if (!this.currentSession) return 0;
    
    const age = Date.now() - this.currentSession.createdAt;
    return Math.max(0, this.config.maxSessionAge - age);
  }

  getSessionStatus(): {
    isActive: boolean;
    remainingTime: number;
    needsRenewal: boolean;
    sessionAge: number;
    metrics: SessionMetrics | null;
  } {
    const remainingTime = this.getRemainingTime();
    const sessionAge = this.currentSession ? 
      Date.now() - this.currentSession.createdAt : 0;

    return {
      isActive: !!this.currentSession && !this.isSessionExpired(),
      remainingTime,
      needsRenewal: this.shouldRenewSession(),
      sessionAge,
      metrics: this.currentSession
    };
  }

  attemptRenewal(): void {
    if (this.currentSession && this.currentSession.renewalAttempts < this.config.maxRenewalAttempts) {
      this.currentSession.renewalAttempts++;
      
      console.log('[SessionManager] Attempting session renewal:', {
        sessionId: this.currentSession.sessionId,
        attempt: this.currentSession.renewalAttempts,
        maxAttempts: this.config.maxRenewalAttempts
      });

      // Signal that renewal is needed
      if (this.onSessionRenewed) {
        this.onSessionRenewed(this.currentSession.sessionId);
      }
    }
  }

  stopSession(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    if (this.currentSession) {
      const finalMetrics = {
        ...this.currentSession,
        conversationDuration: Date.now() - this.currentSession.createdAt
      };
      
      console.log('[SessionManager] Session stopped:', finalMetrics);
      this.currentSession = null;
    }
  }

  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = window.setInterval(() => {
      const status = this.getSessionStatus();
      
      if (!status.isActive) {
        console.log('[SessionManager] Session expired during health check');
        this.onSessionExpired?.();
        this.stopSession();
        return;
      }

      if (status.needsRenewal) {
        console.log('[SessionManager] Session needs renewal during health check');
        this.attemptRenewal();
      }

      // Log status every few checks for debugging
      if (this.currentSession) {
        const minutesRemaining = Math.floor(status.remainingTime / 60000);
        if (minutesRemaining <= 5) {
          console.log('[SessionManager] Health check:', {
            sessionId: this.currentSession.sessionId,
            minutesRemaining,
            errorCount: this.currentSession.errorCount
          });
        }
      }
    }, this.config.healthCheckInterval);
  }
}