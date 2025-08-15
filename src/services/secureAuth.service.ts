// Secure authentication service with enhanced security measures

import { supabase } from '@/integrations/supabase/client';
import { validateInputSecure, authRateLimit, logSecurityThreat, SecureSessionManager } from '@/utils/securityEnhanced';
import { logSecurityEvent } from '@/utils/securityValidation';

export interface SecureAuthResult {
  success: boolean;
  user?: any;
  session?: any;
  error?: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  violations?: number;
}

/**
 * Secure authentication service with comprehensive security measures
 */
export class SecureAuthService {
  
  /**
   * Authenticate user with access code using enhanced security validation
   */
  static async authenticateWithAccessCode(accessCode: string): Promise<SecureAuthResult> {
    const clientIP = await this.getClientIP();
    const rateKey = `auth_${clientIP}`;
    
    // Check rate limiting
    const rateLimitResult = authRateLimit.canAttempt(rateKey);
    if (!rateLimitResult.allowed) {
      logSecurityThreat('authentication_rate_limited', {
        remaining_time: rateLimitResult.remainingTime,
        violations: rateLimitResult.violations
      }, rateLimitResult.violations && rateLimitResult.violations > 3 ? 'critical' : 'high');
      
      return {
        success: false,
        error: `Too many attempts. Try again in ${Math.ceil((rateLimitResult.remainingTime || 0) / 1000 / 60)} minutes.`,
        riskLevel: 'high',
        violations: rateLimitResult.violations
      };
    }

    // Validate input with security checks
    const validation = validateInputSecure(accessCode, 'accessCode');
    if (!validation.isValid) {
      logSecurityThreat('authentication_invalid_input', {
        errors: validation.errors,
        threats: validation.threats,
        risk_level: validation.riskLevel
      }, validation.riskLevel);
      
      return {
        success: false,
        error: validation.errors[0] || 'Invalid access code format',
        riskLevel: validation.riskLevel
      };
    }

    // If threats detected, log and potentially block
    if (validation.threats.length > 0) {
      logSecurityThreat('authentication_threats_detected', {
        threats: validation.threats,
        sanitized_code: validation.sanitized?.substring(0, 3) + '***'
      }, validation.riskLevel);
      
      if (validation.riskLevel === 'critical') {
        return {
          success: false,
          error: 'Security violation detected. Access denied.',
          riskLevel: 'critical'
        };
      }
    }

    try {
      // Use the simple database function for access code validation
      const { data: validationResult, error: validationError } = await supabase
        .rpc('validate_access_code_simple', { 
          input_code: validation.sanitized || accessCode 
        });

      if (validationError) {
        logSecurityThreat('authentication_db_error', { 
          error: validationError.message 
        }, 'high');
        
        return {
          success: false,
          error: 'Authentication service temporarily unavailable',
          riskLevel: 'high'
        };
      }

      if (!validationResult.valid) {
        logSecurityThreat('authentication_failed', {
          reason: validationResult.reason,
          client_ip: clientIP
        }, 'medium');
        
        return {
          success: false,
          error: this.getReadableErrorMessage(validationResult.reason),
          riskLevel: 'medium'
        };
      }

      // Access code is valid - create secure session
      const sessionToken = await SecureSessionManager.createSession({
        accessCode: accessCode,
        codeType: validationResult.code_type,
        authenticatedAt: new Date().toISOString(),
        clientIP
      });

      // Log successful authentication
      logSecurityEvent('successful_authentication', {
        code_type: validationResult.code_type,
        session_token: sessionToken.substring(0, 8) + '***'
      }, 'low');

      // Create a simple user session based on access code validation
      const simpleUser = {
        id: `temp_${Date.now()}`,
        accessCode: accessCode,
        role: validationResult.code_type,
        profile: {
          displayName: `User_${accessCode.substring(0, 4)}`,
          avatarUrl: '',
          bio: '',
          expertiseAreas: []
        }
      };

      return {
        success: true,
        user: simpleUser,
        session: { token: sessionToken, expiresAt: Date.now() + 30 * 60 * 1000 },
        riskLevel: 'low'
      };

    } catch (error) {
      logSecurityThreat('authentication_exception', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'critical');
      
      return {
        success: false,
        error: 'Authentication failed due to system error',
        riskLevel: 'critical'
      };
    }
  }

  /**
   * Sign out user with secure session cleanup
   */
  static async signOut(): Promise<void> {
    try {
      // Clear secure session
      SecureSessionManager.clearSession();
      
      // Clear any Supabase session
      await supabase.auth.signOut();
      
      // Log sign out
      logSecurityEvent('user_signout', {}, 'low');
      
    } catch (error) {
      logSecurityThreat('signout_error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'medium');
    }
  }

  /**
   * Get current authenticated user from secure session
   */
  static async getCurrentUser(): Promise<any | null> {
    try {
      const sessionData = await SecureSessionManager.getSession();
      return sessionData ? {
        id: `temp_${sessionData.accessCode}`,
        accessCode: sessionData.accessCode,
        role: sessionData.codeType,
        profile: {
          displayName: `User_${sessionData.accessCode.substring(0, 4)}`,
          avatarUrl: '',
          bio: '',
          expertiseAreas: []
        }
      } : null;
    } catch (error) {
      logSecurityThreat('get_user_error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'low');
      return null;
    }
  }

  /**
   * Validate current session security
   */
  static async validateSessionSecurity(): Promise<boolean> {
    try {
      const sessionData = await SecureSessionManager.getSession();
      if (!sessionData) return false;

      // Check session age
      const sessionAge = Date.now() - new Date(sessionData.authenticatedAt).getTime();
      if (sessionAge > 2 * 60 * 60 * 1000) { // 2 hours max
        logSecurityThreat('session_too_old', { age_hours: sessionAge / (60 * 60 * 1000) }, 'medium');
        SecureSessionManager.clearSession();
        return false;
      }

      return true;
    } catch (error) {
      logSecurityThreat('session_validation_error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'medium');
      return false;
    }
  }

  /**
   * Get client IP address (best effort)
   */
  private static async getClientIP(): Promise<string> {
    try {
      // This would typically be done server-side, but for client-side we use a fallback
      return 'client_side';
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Convert database error reasons to user-friendly messages
   */
  private static getReadableErrorMessage(reason: string): string {
    const messages: Record<string, string> = {
      'code_not_found': 'Invalid access code. Please check and try again.',
      'code_expired': 'This access code has expired. Please contact an administrator.',
      'code_inactive': 'This access code is no longer active.',
      'max_uses_exceeded': 'This access code has reached its usage limit.',
      'rate_limited': 'Too many attempts. Please wait before trying again.',
      'invalid_format': 'Access code format is invalid.',
      'invalid_characters': 'Access code contains invalid characters.'
    };
    
    return messages[reason] || 'Authentication failed. Please try again.';
  }
}