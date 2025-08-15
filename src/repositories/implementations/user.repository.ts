import { supabase } from '@/integrations/supabase/client';
import { BaseRepository } from './base.repository';
import { IUserRepository } from '../interfaces';
import { User } from '@/types/api';
import { logger } from '@/utils/logger';

export class UserRepository extends BaseRepository<User> implements IUserRepository {
  constructor() {
    super('profiles');
  }

  async findByEmail(email: string): Promise<User | null> {
    try {
      // First get the user from auth.users table using the email
      const { data: authUser, error: authError } = await supabase.auth.admin.getUserByEmail(email);
      
      if (authError || !authUser.user) {
        return null;
      }

      // Then get the profile data
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        logger.error({ error: profileError, email }, 'User repository findByEmail error');
        throw profileError;
      }

      return profile as User | null;
    } catch (error) {
      logger.error({ error, email }, 'User repository findByEmail failed');
      throw error;
    }
  }

  async updateRole(userId: string, role: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) {
        logger.error({ error, userId, role }, 'User repository updateRole error');
        throw error;
      }

      logger.info({ userId, role }, 'User role updated successfully');
    } catch (error) {
      logger.error({ error, userId, role }, 'User repository updateRole failed');
      throw error;
    }
  }

  // Override to handle profiles table specifics
  async findAll(filter?: Record<string, any>): Promise<User[]> {
    try {
      let query = supabase
        .from('profiles')
        .select(`
          id,
          display_name,
          bio,
          avatar_url,
          role,
          user_role,
          expertise_areas,
          created_at,
          updated_at
        `);
      
      if (filter) {
        Object.entries(filter).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
      }
      
      const { data, error } = await query;
      
      if (error) {
        logger.error({ error, filter }, 'User repository findAll error');
        throw error;
      }
      
      return data as User[];
    } catch (error) {
      logger.error({ error, filter }, 'User repository findAll failed');
      throw error;
    }
  }
}