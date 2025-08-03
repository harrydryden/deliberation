// Enhanced security monitoring service
import { supabase } from '@/integrations/supabase/client';
import { SECURITY_CONFIG, SecurityUtils, SecurityEventType, RiskLevel } from '@/config/securityConfig';

export interface SecurityEvent {
  eventType: SecurityEventType;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
  riskLevel: RiskLevel;
  timestamp?: Date;
}

export interface SecurityAlert {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details: Record<string, any>;
  timestamp: Date;
  resolved: boolean;
}

class SecurityMonitorService {
  private localEvents: SecurityEvent[] = [];
  private alertCallbacks: ((alert: SecurityAlert) => void)[] = [];

  // Log security event to both local storage and database
  async logSecurityEvent(event: SecurityEvent): Promise<void> {
    try {
      // Add timestamp and fingerprint
      const enhancedEvent = {
        ...event,
        timestamp: new Date(),
        fingerprint: SecurityUtils.getClientFingerprint(),
        sessionId: this.getSessionId()
      };

      // Store locally for immediate access
      if (SECURITY_CONFIG.MONITORING.storeLocalEvents) {
        this.localEvents.push(enhancedEvent);
        this.trimLocalEvents();
      }

      // Log to database if user is authenticated
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('security_events').insert({
          event_type: event.eventType,
          user_id: user.id,
          ip_address: await this.getClientIP(),
          user_agent: navigator.userAgent,
          details: event.details || {},
          risk_level: event.riskLevel
        });
      }

      // Check for alert conditions
      await this.checkAlertConditions(enhancedEvent);

      console.warn('Security Event:', {
        type: event.eventType,
        risk: event.riskLevel,
        details: SecurityUtils.hashForLogging(JSON.stringify(event.details || {}))
      });

    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  // Monitor file upload security
  async monitorFileUpload(file: File, userId?: string): Promise<{ allowed: boolean; reason?: string }> {
    const validation = SecurityUtils.validateFileSecurely(file);
    
    await this.logSecurityEvent({
      eventType: SecurityEventType.SUSPICIOUS_ACTIVITY,
      userId,
      details: {
        action: 'file_upload_attempt',
        fileName: SecurityUtils.hashForLogging(file.name),
        fileSize: file.size,
        fileType: file.type,
        validation
      },
      riskLevel: validation.riskLevel as RiskLevel
    });

    if (!validation.valid) {
      await this.triggerAlert({
        type: 'suspicious_file_upload',
        severity: validation.riskLevel === 'critical' ? 'critical' : 'medium',
        message: `Suspicious file upload blocked: ${validation.error}`,
        details: {
          fileName: SecurityUtils.hashForLogging(file.name),
          fileType: file.type,
          reason: validation.error
        }
      });
    }

    return { 
      allowed: validation.valid, 
      reason: validation.error 
    };
  }

  // Monitor input for injection attempts
  async monitorInput(input: string, context: string, userId?: string): Promise<boolean> {
    const injection = SecurityUtils.detectInjectionAttempt(input);
    
    if (injection.detected) {
      await this.logSecurityEvent({
        eventType: SecurityEventType.INJECTION_ATTEMPT,
        userId,
        details: {
          context,
          injectionType: injection.type,
          inputHash: SecurityUtils.hashForLogging(input)
        },
        riskLevel: injection.riskLevel as RiskLevel
      });

      await this.triggerAlert({
        type: 'injection_attempt',
        severity: injection.riskLevel === 'critical' ? 'critical' : 'high',
        message: `${injection.type?.toUpperCase()} injection attempt detected in ${context}`,
        details: {
          type: injection.type,
          context,
          inputHash: SecurityUtils.hashForLogging(input)
        }
      });

      return false;
    }

    return true;
  }

  // Monitor authentication attempts
  async monitorAuthAttempt(success: boolean, email?: string, errorType?: string): Promise<void> {
    await this.logSecurityEvent({
      eventType: success ? SecurityEventType.AUTH_SUCCESS : SecurityEventType.AUTH_FAILURE,
      details: {
        email: email ? SecurityUtils.hashForLogging(email) : undefined,
        errorType,
        userAgent: navigator.userAgent
      },
      riskLevel: success ? RiskLevel.LOW : RiskLevel.MEDIUM
    });

    if (!success) {
      const recentFailures = await this.getRecentFailedAttempts();
      if (recentFailures >= SECURITY_CONFIG.MONITORING.alertThresholds.bruteForceThreshold) {
        await this.triggerAlert({
          type: 'brute_force_attempt',
          severity: 'high',
          message: `Multiple failed authentication attempts detected`,
          details: {
            failureCount: recentFailures,
            email: email ? SecurityUtils.hashForLogging(email) : undefined
          }
        });
      }
    }
  }

  // Get recent security events
  getRecentEvents(timeframe: number = 3600000): SecurityEvent[] {
    const cutoff = Date.now() - timeframe;
    return this.localEvents.filter(event => 
      event.timestamp && event.timestamp.getTime() > cutoff
    );
  }

  // Get security metrics
  async getSecurityMetrics(): Promise<{
    recentEvents: number;
    criticalEvents: number;
    suspiciousActivity: number;
    blockedAttempts: number;
  }> {
    const recentEvents = this.getRecentEvents();
    
    return {
      recentEvents: recentEvents.length,
      criticalEvents: recentEvents.filter(e => e.riskLevel === RiskLevel.CRITICAL).length,
      suspiciousActivity: recentEvents.filter(e => 
        e.eventType === SecurityEventType.SUSPICIOUS_ACTIVITY
      ).length,
      blockedAttempts: recentEvents.filter(e => 
        e.eventType === SecurityEventType.INJECTION_ATTEMPT ||
        e.eventType === SecurityEventType.AUTH_RATE_LIMITED
      ).length
    };
  }

  // Subscribe to security alerts
  onSecurityAlert(callback: (alert: SecurityAlert) => void): () => void {
    this.alertCallbacks.push(callback);
    return () => {
      this.alertCallbacks = this.alertCallbacks.filter(cb => cb !== callback);
    };
  }

  // Private methods
  private async getClientIP(): Promise<string | null> {
    try {
      // In a real implementation, you might get this from your backend
      return null;
    } catch {
      return null;
    }
  }

  private getSessionId(): string {
    let sessionId = sessionStorage.getItem('security_session_id');
    if (!sessionId) {
      sessionId = SecurityUtils.generateSecureToken(16);
      sessionStorage.setItem('security_session_id', sessionId);
    }
    return sessionId;
  }

  private trimLocalEvents(): void {
    if (this.localEvents.length > SECURITY_CONFIG.MONITORING.maxLocalEvents) {
      this.localEvents = this.localEvents.slice(-SECURITY_CONFIG.MONITORING.maxLocalEvents);
    }
  }

  private async getRecentFailedAttempts(): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 3600000);
    const { data } = await supabase
      .from('security_events')
      .select('id')
      .eq('event_type', SecurityEventType.AUTH_FAILURE)
      .gte('created_at', oneHourAgo.toISOString());
    
    return data?.length || 0;
  }

  private async checkAlertConditions(event: SecurityEvent): Promise<void> {
    const recentEvents = this.getRecentEvents();
    const criticalEvents = recentEvents.filter(e => e.riskLevel === RiskLevel.CRITICAL);
    const highRiskEvents = recentEvents.filter(e => e.riskLevel === RiskLevel.HIGH);

    // Check thresholds
    if (criticalEvents.length >= SECURITY_CONFIG.MONITORING.alertThresholds.criticalEventsPerHour) {
      await this.triggerAlert({
        type: 'critical_events_threshold',
        severity: 'critical',
        message: `Critical security events threshold exceeded`,
        details: { count: criticalEvents.length }
      });
    }

    if (highRiskEvents.length >= SECURITY_CONFIG.MONITORING.alertThresholds.highRiskEventsPerHour) {
      await this.triggerAlert({
        type: 'high_risk_threshold',
        severity: 'high',
        message: `High-risk events threshold exceeded`,
        details: { count: highRiskEvents.length }
      });
    }
  }

  private async triggerAlert(alertData: Omit<SecurityAlert, 'id' | 'timestamp' | 'resolved'>): Promise<void> {
    const alert: SecurityAlert = {
      id: SecurityUtils.generateSecureToken(8),
      timestamp: new Date(),
      resolved: false,
      ...alertData
    };

    // Notify all subscribers
    this.alertCallbacks.forEach(callback => {
      try {
        callback(alert);
      } catch (error) {
        console.error('Error in security alert callback:', error);
      }
    });
  }
}

export const securityMonitor = new SecurityMonitorService();