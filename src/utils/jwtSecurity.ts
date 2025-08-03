// Enhanced JWT security utilities
import { SECURITY_CONFIG, SecurityUtils, SecurityEventType, RiskLevel } from '@/config/securityConfig';
import { logSecurityEvent } from '@/utils/securityValidation';

interface JWTPayload {
  sub: string;
  iat: number;
  exp: number;
  role?: string;
  session_id?: string;
}

interface TokenValidationResult {
  valid: boolean;
  payload?: JWTPayload;
  errors: string[];
  riskLevel: RiskLevel;
  shouldRefresh: boolean;
}

export class JWTSecurityManager {
  private static readonly TOKEN_KEY = 'auth_token';
  private static readonly SESSION_KEY = 'session_info';
  
  // Enhanced token validation (client-side only for UX)
  static validateToken(token: string): TokenValidationResult {
    const result: TokenValidationResult = {
      valid: false,
      errors: [],
      riskLevel: RiskLevel.LOW,
      shouldRefresh: false
    };

    if (!token) {
      result.errors.push('No token provided');
      return result;
    }

    try {
      // Basic JWT structure validation
      const parts = token.split('.');
      if (parts.length !== 3) {
        result.errors.push('Invalid JWT structure');
        result.riskLevel = RiskLevel.MEDIUM;
        return result;
      }

      // Decode payload (unsafe - for client-side UX only)
      const payloadBase64 = parts[1];
      const payload: JWTPayload = JSON.parse(atob(payloadBase64));

      // Basic expiration check
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        result.errors.push('Token expired');
        result.riskLevel = RiskLevel.MEDIUM;
        return result;
      }

      // Check if token should be refreshed (15 minutes before expiry)
      const refreshThreshold = SECURITY_CONFIG.SESSION.refreshThresholdMinutes * 60;
      if (payload.exp && (payload.exp - now) < refreshThreshold) {
        result.shouldRefresh = true;
      }

      // Validate session duration
      const maxDuration = SECURITY_CONFIG.SESSION.maxDurationHours * 3600;
      if (payload.iat && (now - payload.iat) > maxDuration) {
        result.errors.push('Session too old');
        result.riskLevel = RiskLevel.HIGH;
        return result;
      }

      result.valid = true;
      result.payload = payload;
      return result;

    } catch (error) {
      result.errors.push('Failed to parse token');
      result.riskLevel = RiskLevel.HIGH;
      logSecurityEvent(SecurityEventType.SUSPICIOUS_ACTIVITY, {
        error: 'JWT parsing failed',
        tokenLength: token.length,
        riskLevel: RiskLevel.HIGH
      });
      return result;
    }
  }

  // Secure token storage
  static storeToken(token: string): void {
    try {
      const validation = this.validateToken(token);
      
      if (!validation.valid) {
        logSecurityEvent(SecurityEventType.AUTH_FAILURE, {
          reason: 'Invalid token storage attempt',
          errors: validation.errors,
          riskLevel: validation.riskLevel
        });
        throw new Error('Cannot store invalid token');
      }

      // Store token securely
      localStorage.setItem(this.TOKEN_KEY, token);
      
      // Store session metadata
      const sessionInfo = {
        storedAt: Date.now(),
        fingerprint: SecurityUtils.getClientFingerprint(),
        userAgent: navigator.userAgent.slice(0, 100),
        sessionId: validation.payload?.session_id || SecurityUtils.generateSecureToken(16)
      };
      
      localStorage.setItem(this.SESSION_KEY, JSON.stringify(sessionInfo));
      
      logSecurityEvent(SecurityEventType.SESSION_CREATED, {
        sessionId: sessionInfo.sessionId,
        fingerprint: sessionInfo.fingerprint,
        riskLevel: RiskLevel.LOW
      });

    } catch (error) {
      logSecurityEvent(SecurityEventType.AUTH_FAILURE, {
        error: 'Token storage failed',
        riskLevel: RiskLevel.HIGH
      });
      throw error;
    }
  }

  // Retrieve and validate stored token
  static getToken(): string | null {
    try {
      const token = localStorage.getItem(this.TOKEN_KEY);
      
      if (!token) {
        return null;
      }

      const validation = this.validateToken(token);
      
      if (!validation.valid) {
        // Clean up invalid token
        this.clearToken();
        logSecurityEvent(SecurityEventType.SESSION_EXPIRED, {
          reason: 'Invalid stored token',
          errors: validation.errors,
          riskLevel: validation.riskLevel
        });
        return null;
      }

      // Check session integrity
      const sessionInfo = this.getSessionInfo();
      if (sessionInfo && SECURITY_CONFIG.SESSION.trackFingerprint) {
        const currentFingerprint = SecurityUtils.getClientFingerprint();
        if (sessionInfo.fingerprint !== currentFingerprint) {
          this.clearToken();
          logSecurityEvent(SecurityEventType.SUSPICIOUS_ACTIVITY, {
            reason: 'Fingerprint mismatch',
            storedFingerprint: sessionInfo.fingerprint,
            currentFingerprint: currentFingerprint,
            riskLevel: RiskLevel.HIGH
          });
          return null;
        }
      }

      // Log if token should be refreshed
      if (validation.shouldRefresh) {
        logSecurityEvent(SecurityEventType.SESSION_EXPIRED, {
          reason: 'Token needs refresh',
          expiresIn: validation.payload?.exp ? validation.payload.exp - Math.floor(Date.now() / 1000) : 'unknown',
          riskLevel: RiskLevel.LOW
        });
      }

      return token;
      
    } catch (error) {
      logSecurityEvent(SecurityEventType.AUTH_FAILURE, {
        error: 'Token retrieval failed',
        riskLevel: RiskLevel.MEDIUM
      });
      this.clearToken();
      return null;
    }
  }

  // Check if user has valid token (for UX only)
  static hasValidToken(): boolean {
    const token = this.getToken();
    return token !== null;
  }

  // Get session information
  static getSessionInfo(): any {
    try {
      const sessionData = localStorage.getItem(this.SESSION_KEY);
      return sessionData ? JSON.parse(sessionData) : null;
    } catch {
      return null;
    }
  }

  // Secure token cleanup
  static clearToken(): void {
    const sessionInfo = this.getSessionInfo();
    
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.SESSION_KEY);
    
    // Also clear any session storage
    sessionStorage.clear();
    
    logSecurityEvent(SecurityEventType.SESSION_EXPIRED, {
      sessionId: sessionInfo?.sessionId || 'unknown',
      reason: 'Manual logout',
      riskLevel: RiskLevel.LOW
    });
  }

  // Extract user info from token (client-side only)
  static getUserFromToken(): any {
    const token = this.getToken();
    if (!token) return null;

    const validation = this.validateToken(token);
    if (!validation.valid || !validation.payload) return null;

    return {
      id: validation.payload.sub,
      role: validation.payload.role,
      sessionId: validation.payload.session_id,
      expiresAt: validation.payload.exp * 1000, // Convert to milliseconds
      shouldRefresh: validation.shouldRefresh
    };
  }

  // Security health check
  static performSecurityCheck(): { healthy: boolean; issues: string[] } {
    const issues: string[] = [];
    let healthy = true;

    // Check environment security
    const envCheck = SecurityUtils.validateEnvironment();
    if (!envCheck.secure) {
      issues.push(...envCheck.warnings);
      healthy = false;
    }

    // Check for multiple sessions
    const sessionInfo = this.getSessionInfo();
    if (sessionInfo) {
      const sessionAge = Date.now() - sessionInfo.storedAt;
      const maxAge = SECURITY_CONFIG.SESSION.maxDurationHours * 3600 * 1000;
      
      if (sessionAge > maxAge) {
        issues.push('Session exceeded maximum duration');
        healthy = false;
      }
    }

    // Check for security headers (if in iframe)
    if (window !== window.top) {
      issues.push('Application running in iframe - potential security risk');
      healthy = false;
    }

    return { healthy, issues };
  }
}

// Enhanced auth service wrapper
export class SecureAuthService {
  private jwtManager = JWTSecurityManager;

  setToken(token: string | null): void {
    if (token) {
      this.jwtManager.storeToken(token);
    } else {
      this.jwtManager.clearToken();
    }
  }

  getToken(): string | null {
    return this.jwtManager.getToken();
  }

  hasValidToken(): boolean {
    return this.jwtManager.hasValidToken();
  }

  getUserFromToken(): any {
    return this.jwtManager.getUserFromToken();
  }

  clearAuth(): void {
    this.jwtManager.clearToken();
  }

  // Perform security validation before sensitive operations
  validateSecurityContext(): boolean {
    const healthCheck = this.jwtManager.performSecurityCheck();
    
    if (!healthCheck.healthy) {
      logSecurityEvent(SecurityEventType.SECURITY_HEADER_MISSING, {
        issues: healthCheck.issues,
        riskLevel: RiskLevel.MEDIUM
      });
    }

    return healthCheck.healthy;
  }
}

export const secureAuthService = new SecureAuthService();