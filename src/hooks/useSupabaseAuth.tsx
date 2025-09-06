import { useState, useEffect, createContext, useContext } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<{ error: any }>;
  createAdminUsers: () => Promise<{ success: boolean; error?: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const checkAdminStatus = async (userId: string) => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_role')
        .eq('id', userId)
        .single();
      
      const hasAdminRole = profile?.user_role === 'admin' || false;
      setIsAdmin(hasAdminRole);
      return hasAdminRole;
    } catch (error) {
      logger.error('Error checking admin status:', error);
      setIsAdmin(false);
      return false;
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        logger.info('Auth state changed', { event, userId: session?.user?.id });
        
        setSession(session);
        setUser(session?.user ?? null);
        
        // Check admin status when user signs in/out
        if (session?.user) {
          setTimeout(() => checkAdminStatus(session.user.id), 0);
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
        setTimeout(() => {
          checkAdminStatus(session.user.id).finally(() => setIsLoading(false));
        }, 0);
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);


  const createAdminUsers = async () => {
    try {
      logger.info('Creating admin users...');
      
      const adminUsers = [
        { email: 'ADMIN@deliberation.local', password: '123456' },
        { email: 'SUPER@deliberation.local', password: '543210' }
      ];

      const results = [];
      
      for (const { email, password } of adminUsers) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { role: 'admin' }
          }
        });

        if (error) {
          logger.error(`Error creating user ${email}:`, error);
          results.push({ email, success: false, error });
        } else {
          logger.info(`User ${email} created successfully`);
          
          // Set admin role in profiles table
          if (data.user) {
            await supabase
              .from('profiles')
              .upsert({ 
                id: data.user.id,
                user_role: 'admin',
                created_at: new Date().toISOString()
              });
          }
          results.push({ email, success: true });
        }
      }

      return { success: true, results };
    } catch (error) {
      logger.error('Error in createAdminUsers:', error);
      return { success: false, error };
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
    signIn,
    signOut,
    createAdminUsers
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