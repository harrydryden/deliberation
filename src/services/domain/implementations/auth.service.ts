import { supabase } from '@/integrations/supabase/client';
import { IAuthService } from '../interfaces';
import { IUserRepository } from '@/repositories/interfaces';
import { User } from '@/types/api';
import { logger } from '@/utils/logger';
import { AuthenticationError } from '@/utils/errors';

export class AuthService implements IAuthService {
  constructor(private userRepository: IUserRepository) {}

  async signIn(email: string, password: string): Promise<{ user: User; session: any }> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        logger.error({ error, email }, 'Auth service signIn error');
        throw new AuthenticationError(error.message);
      }

      if (!data.user || !data.session) {
        throw new AuthenticationError('Invalid authentication response');
      }

      // Get user profile from our repository
      const userProfile = await this.userRepository.findById(data.user.id);
      
      if (!userProfile) {
        throw new AuthenticationError('User profile not found');
      }

      logger.info({ userId: data.user.id, email }, 'User signed in successfully');
      
      return {
        user: userProfile,
        session: data.session,
      };
    } catch (error) {
      logger.error({ error, email }, 'Auth service signIn failed');
      throw error;
    }
  }

  async signUp(email: string, password: string): Promise<{ user: User; session: any }> {
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        logger.error({ error, email }, 'Auth service signUp error');
        throw new AuthenticationError(error.message);
      }

      if (!data.user) {
        throw new AuthenticationError('User registration failed');
      }

      // If email confirmation is disabled, we should have a session
      if (data.session && data.user.email_confirmed_at) {
        const userProfile = await this.userRepository.findById(data.user.id);
        
        if (!userProfile) {
          // Create a basic profile if it doesn't exist (backup)
          const newProfile = await this.userRepository.create({
            id: data.user.id,
            display_name: data.user.email?.split('@')[0] || 'User',
            role: 'user',
            user_role: 'user',
          } as any);
          
          return {
            user: newProfile,
            session: data.session,
          };
        }

        return {
          user: userProfile,
          session: data.session,
        };
      }

      logger.info({ userId: data.user.id, email, confirmationRequired: !data.session }, 'User signed up');
      
      // For email confirmation flow, return a placeholder user
      return {
        user: {
          id: data.user.id,
          display_name: email.split('@')[0],
          role: 'user',
          user_role: 'user',
        } as User,
        session: data.session,
      };
    } catch (error) {
      logger.error({ error, email }, 'Auth service signUp failed');
      throw error;
    }
  }

  async signOut(): Promise<void> {
    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        logger.error({ error }, 'Auth service signOut error');
        throw new AuthenticationError(error.message);
      }

      logger.info('User signed out successfully');
    } catch (error) {
      logger.error({ error }, 'Auth service signOut failed');
      throw error;
    }
  }

  async getCurrentUser(): Promise<User | null> {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error) {
        logger.error({ error }, 'Auth service getCurrentUser error');
        return null;
      }

      if (!user) {
        return null;
      }

      const userProfile = await this.userRepository.findById(user.id);
      return userProfile;
    } catch (error) {
      logger.error({ error }, 'Auth service getCurrentUser failed');
      return null;
    }
  }

  async getCurrentSession(): Promise<any> {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        logger.error({ error }, 'Auth service getCurrentSession error');
        return null;
      }

      return session;
    } catch (error) {
      logger.error({ error }, 'Auth service getCurrentSession failed');
      return null;
    }
  }

  onAuthStateChange(callback: (event: string, session: any) => void): () => void {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Ensure synchronous callback execution to prevent deadlocks
      callback(event, session);
    });

    return () => subscription.unsubscribe();
  }
}