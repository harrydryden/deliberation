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

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        logger.info('Auth state changed', { event, userId: session?.user?.id });
        
        setSession(session);
        setUser(session?.user ?? null);
        
        // Check admin status when user signs in
        if (session?.user) {
          // Simple admin check - treat specific email as admin
          const isAdminUser = session.user.email === 'ADMIN@deliberation.local' || 
                             session.user.email === 'SUPER@deliberation.local';
          setIsAdmin(isAdminUser);
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
        const isAdminUser = session.user.email === 'ADMIN@deliberation.local' || 
                           session.user.email === 'SUPER@deliberation.local';
        setIsAdmin(isAdminUser);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);


  const createAdminUsers = async () => {
    try {
      console.log('Creating admin users...');
      
      // Create ADMIN user
      const { data: adminData, error: adminError } = await supabase.auth.signUp({
        email: 'ADMIN@deliberation.local',
        password: '123456',
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            role: 'admin'
          }
        }
      });

      if (adminError) {
        console.error('Error creating admin user:', adminError);
      } else {
        console.log('Admin user created successfully', adminData);
        
        // Set admin role in profiles table
        if (adminData.user) {
          await supabase
            .from('profiles')
            .upsert({ 
              id: adminData.user.id,
              user_role: 'admin',
              created_at: new Date().toISOString()
            });
        }
      }

      // Create SUPER user
      const { data: superData, error: superError } = await supabase.auth.signUp({
        email: 'SUPER@deliberation.local',
        password: '543210',
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            role: 'admin'
          }
        }
      });

      if (superError) {
        console.error('Error creating super user:', superError);
      } else {
        console.log('Super user created successfully', superData);
        
        // Set admin role in profiles table
        if (superData.user) {
          await supabase
            .from('profiles')
            .upsert({ 
              id: superData.user.id,
              user_role: 'admin',
              created_at: new Date().toISOString()
            });
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Error in createAdminUsers:', error);
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