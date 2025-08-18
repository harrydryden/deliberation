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
  createAccessCodeUsers: (count: number, roleType: 'admin' | 'user') => Promise<{ users: Array<{ accessCode1: string; accessCode2: string; role: string }>, error?: any }>;
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

  const generateAccessCode1 = (): string => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 5; i++) {
      result += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    return result;
  };

  const generateAccessCode2 = (): string => {
    return Math.floor(10000 + Math.random() * 90000).toString();
  };

  const createAccessCodeUsers = async (count: number, roleType: 'admin' | 'user' = 'user') => {
    try {
      const users = [];
      
      for (let i = 0; i < count; i++) {
        const accessCode1 = generateAccessCode1();
        const accessCode2 = generateAccessCode2();
        const email = `${accessCode1}@deliberation.local`;
        
        // Create user in Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email,
          password: accessCode2,
          user_metadata: {
            access_code_1: accessCode1,
            access_code_2: accessCode2,
            role: roleType
          }
        });

        if (authError) {
          logger.error('Error creating user:', authError);
          continue;
        }

        if (authData.user) {
          // Add to user_roles table
          await supabase
            .from('user_roles')
            .insert({
              user_id: authData.user.id,
              role: roleType
            });

          users.push({
            accessCode1,
            accessCode2,
            role: roleType
          });
        }
      }

      return { users };
    } catch (error) {
      logger.error('Error creating access code users:', error);
      return { users: [], error };
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
    createAccessCodeUsers
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