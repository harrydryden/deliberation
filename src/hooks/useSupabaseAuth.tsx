import { useState, useEffect, createContext, useContext } from 'react';
import { User, Session, createClient } from '@supabase/supabase-js';
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
          setTimeout(async () => {
            try {
              console.log('Auth state change - checking admin status for user:', session.user.id);
              
              // Ensure profile exists
              const { error: profileError } = await supabase
                .from('profiles')
                .upsert({ 
                  id: session.user.id,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  is_archived: false
                });
              
              if (profileError) {
                console.log('Profile upsert error (might be expected):', profileError);
              }
              
              const { data: roles, error } = await supabase
                .from('user_roles')
                .select('role')
                .eq('user_id', session.user.id);
              
              console.log('User roles query result:', { roles, error });
              let hasAdminRole = roles?.some(r => r.role === 'admin') || false;
              
              console.log('Has admin role:', hasAdminRole);
              setIsAdmin(hasAdminRole);
            } catch (error) {
              console.error('Error checking admin status:', error);
              logger.error('Error checking admin status:', error);
              setIsAdmin(false);
            }
          }, 0);
        } else {
          console.log('No session user, setting isAdmin to false');
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
            console.log('Initial session - checking admin status for user:', session.user.id);
            
            // Ensure profile exists
            const { error: profileError } = await supabase
              .from('profiles')
              .upsert({ 
                id: session.user.id,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                is_archived: false
              });
            
            if (profileError) {
              console.log('Profile upsert error (might be expected):', profileError);
            }
            
            const { data: roles, error } = await supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', session.user.id);
            
            console.log('User roles query result:', { roles, error });
            let hasAdminRole = roles?.some(r => r.role === 'admin') || false;
            
            console.log('Final admin status:', hasAdminRole);
            setIsAdmin(hasAdminRole);
          } catch (error) {
            console.error('Error checking admin status:', error);
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
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

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
        
        // Add admin role to user_roles table
        if (adminData.user) {
          await supabase
            .from('user_roles')
            .insert({
              user_id: adminData.user.id,
              role: 'admin'
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
        
        // Add admin role to user_roles table
        if (superData.user) {
          await supabase
            .from('user_roles')
            .insert({
              user_id: superData.user.id,
              role: 'admin'
            });
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Error in createAdminUsers:', error);
      return { success: false, error };
    }
  };

  const createAccessCodeUsers = async (count: number, roleType: 'admin' | 'user' = 'user') => {
    try {
      const users = [];
      
      // Create a separate admin client that won't affect current auth state
      const adminClient = createClient(
        'https://iowsxuxkgvpgrvvklwyt.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3N4dXhrZ3ZwZ3J2dmtsd3l0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzMwMDA5NiwiZXhwIjoyMDY4ODc2MDk2fQ.XGBR78aD3lBUJCHOLJLlcAYtY6BLGQXhKYfJgp3bAu0',
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      );
      
      for (let i = 0; i < count; i++) {
        const accessCode1 = generateAccessCode1();
        const accessCode2 = generateAccessCode2();
        const email = `${accessCode1}@deliberation.local`;
        
        // Use admin client to create user without signing them in
        const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
          email,
          password: accessCode2,
          email_confirm: true, // Auto-confirm to avoid email verification
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

        users.push({
          accessCode1,
          accessCode2,
          role: roleType
        });
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
    createAccessCodeUsers,
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