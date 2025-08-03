// Enhanced secure authentication hook with comprehensive security monitoring
import { useState, useEffect, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { securityMonitor } from '@/services/securityMonitor.service';
import { SecurityEventType, RiskLevel, SecurityUtils } from '@/config/securityConfig';
import { useToast } from '@/hooks/use-toast';

interface SecureAuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;
  securityWarnings: string[];
}

interface AuthAttemptResult {
  success: boolean;
  error?: string;
  securityBlocked?: boolean;
  requiresMFA?: boolean;
}

export const useSecureAuth = () => {
  const [authState, setAuthState] = useState<SecureAuthState>({
    user: null,
    session: null,
    loading: true,
    isAuthenticated: false,
    securityWarnings: []
  });

  const { toast } = useToast();

  // Initialize auth state and security monitoring
  useEffect(() => {
    // Check environment security
    const envValidation = SecurityUtils.validateEnvironment();
    if (!envValidation.secure) {
      setAuthState(prev => ({
        ...prev,
        securityWarnings: envValidation.warnings
      }));
    }

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setAuthState(prev => ({
          ...prev,
          session,
          user: session?.user ?? null,
          isAuthenticated: !!session?.user,
          loading: false
        }));

        // Log auth events
        if (event === 'SIGNED_IN' && session?.user) {
          await securityMonitor.logSecurityEvent({
            eventType: SecurityEventType.SESSION_CREATED,
            userId: session.user.id,
            details: {
              provider: session.user.app_metadata?.provider,
              fingerprint: SecurityUtils.getClientFingerprint()
            },
            riskLevel: RiskLevel.LOW
          });
        } else if (event === 'SIGNED_OUT') {
          await securityMonitor.logSecurityEvent({
            eventType: SecurityEventType.SESSION_EXPIRED,
            details: { reason: 'user_logout' },
            riskLevel: RiskLevel.LOW
          });
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthState(prev => ({
        ...prev,
        session,
        user: session?.user ?? null,
        isAuthenticated: !!session?.user,
        loading: false
      }));
    });

    return () => subscription.unsubscribe();
  }, []);

  // Secure sign in with enhanced validation
  const signIn = useCallback(async (
    email: string, 
    password: string
  ): Promise<AuthAttemptResult> => {
    try {
      // Input validation and injection detection
      const emailClean = email.trim().toLowerCase();
      const emailValidation = await securityMonitor.monitorInput(emailClean, 'email_signin');
      const passwordValidation = await securityMonitor.monitorInput(password, 'password_signin');

      if (!emailValidation || !passwordValidation) {
        await securityMonitor.monitorAuthAttempt(false, emailClean, 'injection_detected');
        return { 
          success: false, 
          error: 'Invalid input detected', 
          securityBlocked: true 
        };
      }

      // Attempt sign in
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailClean,
        password
      });

      const success = !error && !!data.user;
      
      // Monitor auth attempt
      await securityMonitor.monitorAuthAttempt(success, emailClean, error?.message);

      if (error) {
        return { 
          success: false, 
          error: error.message 
        };
      }

      if (data.user) {
        // Log successful authentication
        await securityMonitor.logSecurityEvent({
          eventType: SecurityEventType.AUTH_SUCCESS,
          userId: data.user.id,
          details: {
            email: SecurityUtils.hashForLogging(emailClean),
            provider: 'email',
            fingerprint: SecurityUtils.getClientFingerprint()
          },
          riskLevel: RiskLevel.LOW
        });

        toast({
          title: "Welcome back!",
          description: "You have been successfully signed in.",
        });
      }

      return { success };

    } catch (error: any) {
      await securityMonitor.monitorAuthAttempt(false, email, error.message);
      return { 
        success: false, 
        error: error.message || 'Authentication failed' 
      };
    }
  }, [toast]);

  // Secure sign up with password strength validation
  const signUp = useCallback(async (
    email: string, 
    password: string,
    metadata?: Record<string, any>
  ): Promise<AuthAttemptResult> => {
    try {
      // Enhanced input validation
      const emailClean = email.trim().toLowerCase();
      const emailValidation = await securityMonitor.monitorInput(emailClean, 'email_signup');
      const passwordValidation = await securityMonitor.monitorInput(password, 'password_signup');

      if (!emailValidation || !passwordValidation) {
        return { 
          success: false, 
          error: 'Invalid input detected', 
          securityBlocked: true 
        };
      }

      // Validate password strength using database function
      const { data: passwordCheck } = await supabase.rpc('validate_password_strength', {
        password
      });

      if (passwordCheck && !passwordCheck.valid) {
        await securityMonitor.logSecurityEvent({
          eventType: SecurityEventType.AUTH_FAILURE,
          details: {
            reason: 'weak_password',
            email: SecurityUtils.hashForLogging(emailClean),
            passwordScore: passwordCheck.score
          },
          riskLevel: RiskLevel.MEDIUM
        });

        return {
          success: false,
          error: 'Password does not meet security requirements. Please use a stronger password with uppercase, lowercase, numbers, and special characters.'
        };
      }

      // Attempt sign up
      const redirectUrl = `${window.location.origin}/`;
      const { data, error } = await supabase.auth.signUp({
        email: emailClean,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: metadata || {}
        }
      });

      if (error) {
        await securityMonitor.logSecurityEvent({
          eventType: SecurityEventType.AUTH_FAILURE,
          details: {
            reason: 'signup_failed',
            email: SecurityUtils.hashForLogging(emailClean),
            error: error.message
          },
          riskLevel: RiskLevel.MEDIUM
        });

        return { 
          success: false, 
          error: error.message 
        };
      }

      if (data.user) {
        await securityMonitor.logSecurityEvent({
          eventType: SecurityEventType.AUTH_SUCCESS,
          userId: data.user.id,
          details: {
            action: 'signup',
            email: SecurityUtils.hashForLogging(emailClean),
            needsConfirmation: !data.session
          },
          riskLevel: RiskLevel.LOW
        });

        const message = data.session 
          ? "Account created successfully!" 
          : "Please check your email to confirm your account.";

        toast({
          title: "Account Created",
          description: message,
        });
      }

      return { success: true };

    } catch (error: any) {
      await securityMonitor.logSecurityEvent({
        eventType: SecurityEventType.AUTH_FAILURE,
        details: {
          reason: 'signup_error',
          error: error.message
        },
        riskLevel: RiskLevel.HIGH
      });

      return { 
        success: false, 
        error: error.message || 'Account creation failed' 
      };
    }
  }, [toast]);

  // Secure sign out
  const signOut = useCallback(async (): Promise<void> => {
    try {
      const currentUser = authState.user;
      
      await supabase.auth.signOut();

      if (currentUser) {
        await securityMonitor.logSecurityEvent({
          eventType: SecurityEventType.SESSION_EXPIRED,
          userId: currentUser.id,
          details: { reason: 'user_logout' },
          riskLevel: RiskLevel.LOW
        });
      }

      toast({
        title: "Signed out",
        description: "You have been successfully signed out.",
      });

    } catch (error: any) {
      console.error('Sign out error:', error);
      toast({
        title: "Error",
        description: "Failed to sign out properly",
        variant: "destructive"
      });
    }
  }, [authState.user, toast]);

  // Check if user has specific role with security logging
  const hasRole = useCallback((role: string): boolean => {
    if (!authState.user) return false;
    
    // This would typically come from user metadata or profile
    // For now, we'll use a simple check
    return authState.user.user_metadata?.role === role;
  }, [authState.user]);

  // Get security metrics for current session
  const getSessionSecurity = useCallback(async () => {
    if (!authState.user) return null;

    try {
      return await securityMonitor.getSecurityMetrics();
    } catch (error) {
      console.error('Failed to get security metrics:', error);
      return null;
    }
  }, [authState.user]);

  return {
    ...authState,
    signIn,
    signUp, 
    signOut,
    hasRole,
    getSessionSecurity,
    // Utility functions
    validateInput: securityMonitor.monitorInput.bind(securityMonitor),
    isSecureContext: SecurityUtils.isSecureContext(),
  };
};