import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContextType, User } from '@/types/auth';
import { simpleAuthService } from '@/services/domain/container';
import { logger } from '@/utils/logger';
import { setUserContext } from '@/integrations/supabase/client';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  // Initialize authentication state
  useEffect(() => {
    const initAuth = async () => {
      try {
        const storedUser = localStorage.getItem('simple_auth_user');
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          console.log('Restoring user session:', parsedUser.id);
          
          // Set user context for RLS policies immediately
          await setUserContext();
          
          setUser(parsedUser);
        }
      } catch (error) {
        console.error('Failed to initialize auth:', error);
        localStorage.removeItem('simple_auth_user');
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []); // Remove location dependency to prevent re-runs

  // Handle redirects separately when user state changes
  useEffect(() => {
    if (!isLoading && user) {
      // If user is on auth page and has valid session, redirect based on role
      if (location.pathname === '/auth' || location.pathname === '/') {
        if (user.role === 'admin') {
          console.log('Redirecting admin to admin dashboard');
          navigate('/admin', { replace: true });
        } else {
          const lastDeliberationId = localStorage.getItem('last_deliberation_id');
          if (lastDeliberationId) {
            console.log('Redirecting to last deliberation:', lastDeliberationId);
            navigate(`/deliberations/${lastDeliberationId}`, { replace: true });
          } else {
            navigate('/deliberations', { replace: true });
          }
        }
      }
    }
  }, [user, isLoading, location.pathname, navigate]);

  const authenticate = async (accessCode: string): Promise<void> => {
    try {
      setIsLoading(true);
      const result = await simpleAuthService.authenticateWithAccessCode(accessCode);
      
      console.log('Authentication successful:', result.user.id, 'Role:', result.user.role);
      
      // Store user and set context
      localStorage.setItem('simple_auth_user', JSON.stringify(result.user));
      await setUserContext();
      
      setUser(result.user);
      
      logger.info('User authenticated successfully', { 
        userId: result.user.id, 
        role: result.user.role 
      });
      
      // Redirect based on user role
      if (result.user.role === 'admin') {
        console.log('Redirecting admin to admin dashboard');
        navigate('/admin', { replace: true });
      } else {
        // Check for last deliberation and redirect regular users
        const lastDeliberationId = localStorage.getItem('last_deliberation_id');
        if (lastDeliberationId) {
          console.log('Redirecting to last deliberation after auth:', lastDeliberationId);
          setTimeout(() => {
            navigate(`/deliberations/${lastDeliberationId}`, { replace: true });
          }, 200);
        } else {
          navigate('/deliberations', { replace: true });
        }
      }
    } catch (error) {
      logger.error('Authentication failed', { error });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const authenticateWithAccessCode = async (accessCode: string, codeType?: string): Promise<void> => {
    return authenticate(accessCode);
  };

  const signOut = async (): Promise<void> => {
    try {
      await simpleAuthService.signOut();
      localStorage.removeItem('simple_auth_user');
      localStorage.removeItem('last_deliberation_id');
      setUser(null);
      navigate('/auth');
      logger.info('User signed out successfully');
    } catch (error) {
      logger.error('Sign out failed', { error });
      throw error;
    }
  };

  const logout = async (): Promise<void> => {
    return signOut();
  };

  const refreshToken = async (): Promise<void> => {
    // Simple auth doesn't use refresh tokens
    // Just ensure user context is set
    if (user) {
      await setUserContext();
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    authenticate,
    authenticateWithAccessCode,
    signOut,
    logout,
    isAuthenticated: !!user,
    refreshToken
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
