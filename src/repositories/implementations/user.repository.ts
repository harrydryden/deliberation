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
      // Search for user by email in profiles table (assuming email is stored there)
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', email)
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.error('User repository findByEmail error', error, { email });
        throw error;
      }

      if (!profile) {
        return null;
      }

      return {
        id: profile.id,
        accessCode: '', // Will be populated from context
        role: profile.user_role || 'user',
        profile: {
          displayName: profile.display_name || '',
          avatarUrl: profile.avatar_url || '',
          bio: profile.bio || '',
          expertiseAreas: profile.expertise_areas || [],
        },
      } as User;
    } catch (error) {
      logger.error('User repository findByEmail failed', error, { email });
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
        logger.error('User repository updateRole error', error, { userId, role });
        throw error;
      }

      logger.info('User role updated successfully', { userId, role });
    } catch (error) {
      logger.error('User repository updateRole failed', error, { userId, role });
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
        logger.error('User repository findAll error', error, { filter });
        throw error;
      }
      
      // Map database format to API format
      return data.map(item => ({
        id: item.id,
        accessCode: '', // Will be populated from context if needed
        role: item.user_role || item.role || 'user',
        profile: {
          displayName: item.display_name || '',
          avatarUrl: item.avatar_url || '',
          bio: item.bio || '',
          expertiseAreas: item.expertise_areas || [],
        },
      })) as User[];
    } catch (error) {
      logger.error('User repository findAll failed', error, { filter });
      throw error;
    }
  }
}