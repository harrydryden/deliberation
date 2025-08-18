import { useState, useEffect, createContext, useContext } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAdmin: boolean;
  signUp: (email: string, password: string, accessCode?: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<{ error: any }>;
  validateAccessCode: (code: string) => Promise<{ isValid: boolean; codeType: string; error?: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        logger.info('Auth state changed', { event, userId: session?.user?.id });
        
        setSession(session);
        setUser(session?.user ?? null);
        
        // Check admin status when user signs in
        if (session?.user) {
          setTimeout(async () => {
            try {
              const { data: roles } = await supabase
                .from('user_roles')
                .select('role')
                .eq('user_id', session.user.id);
              
              const hasAdminRole = roles?.some(r => r.role === 'admin') || false;
              setIsAdmin(hasAdminRole);
            } catch (error) {
              logger.error('Error checking admin status:', error);
              setIsAdmin(false);
            }
          }, 0);
        } else {
          setIsAdmin(false);
        }
        
        setIsLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      // Check admin status for existing session
      if (session?.user) {
        setTimeout(async () => {
          try {
            const { data: roles } = await supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', session.user.id);
            
            const hasAdminRole = roles?.some(r => r.role === 'admin') || false;
            setIsAdmin(hasAdminRole);
          } catch (error) {
            logger.error('Error checking admin status:', error);
            setIsAdmin(false);
          }
          setIsLoading(false);
        }, 0);
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const validateAccessCode = async (code: string) => {
    try {
      const { data, error } = await supabase
        .from('access_codes')
        .select('code_type, is_active, is_used, expires_at, max_uses, current_uses')
        .eq('code', code)
        .single();

      if (error || !data) {
        return { isValid: false, codeType: '', error: 'Invalid access code' };
      }

      if (!data.is_active) {
        return { isValid: false, codeType: '', error: 'Access code is inactive' };
      }

      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        return { isValid: false, codeType: '', error: 'Access code has expired' };
      }

      if (data.max_uses && data.current_uses >= data.max_uses) {
        return { isValid: false, codeType: '', error: 'Access code usage limit reached' };
      }

      return { isValid: true, codeType: data.code_type };
    } catch (error) {
      logger.error('Error validating access code:', error);
      return { isValid: false, codeType: '', error: 'Error validating access code' };
    }
  };

  const signUp = async (email: string, password: string, accessCode?: string) => {
    try {
      // Validate access code if provided
      let codeType = 'user';
      if (accessCode) {
        const validation = await validateAccessCode(accessCode);
        if (!validation.isValid) {
          return { error: validation.error };
        }
        codeType = validation.codeType;
      }

      const redirectUrl = `${window.location.origin}/`;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            access_code: accessCode,
            access_code_type: codeType
          }
        }
      });

      // Update access code usage if provided
      if (accessCode && !error) {
        await supabase
          .from('access_codes')
          .update({ 
            current_uses: supabase.rpc('increment', { x: 1 }),
            last_used_at: new Date().toISOString()
          })
          .eq('code', accessCode);
      }

      return { error };
    } catch (error) {
      logger.error('Sign up error:', error);
      return { error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error };
    } catch (error) {
      logger.error('Sign in error:', error);
      return { error };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (!error) {
        setUser(null);
        setSession(null);
        setIsAdmin(false);
      }
      return { error };
    } catch (error) {
      logger.error('Sign out error:', error);
      return { error };
    }
  };

  const value = {
    user,
    session,
    isLoading,
    isAdmin,
    signUp,
    signIn,
    signOut,
    validateAccessCode
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useSupabaseAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useSupabaseAuth must be used within an AuthProvider');
  }
  return context;
};