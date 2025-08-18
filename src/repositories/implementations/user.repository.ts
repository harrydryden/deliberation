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
          displayName: '',
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

  // Override to handle profiles table specifics - excludes archived users
  async findAll(filter?: Record<string, any>): Promise<User[]> {
    try {
      // Query profiles with access codes and deliberations
      let query = supabase
        .from('user_profiles_with_deliberations_with_codes')
        .select('*')
        .or('is_archived.is.null,is_archived.eq.false'); // Exclude archived users
      
      if (filter) {
        Object.entries(filter).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
      }
      
      const { data, error } = await query;
      
      if (error) {
        logger.error('User repository findAll failed', error, { filter });
        throw error;
      }
      
      return (data || []).map(item => ({
        id: item.id,
        accessCode: item.access_code || '',
        role: item.user_role || 'user',
        profile: {
          displayName: '',
          avatarUrl: '',
          bio: '',
          expertiseAreas: [],
        },
        deliberations: Array.isArray(item.deliberations) ? item.deliberations : [],
        isArchived: item.is_archived || false,
        archivedAt: item.archived_at,
        archivedBy: item.archived_by,
        archiveReason: item.archive_reason,
      })) as User[];
    } catch (error) {
      logger.error('User repository findAll failed', error, { filter });
      throw error;
    }
  }

  async archiveUser(userId: string, archivedBy: string, reason?: string): Promise<void> {
    try {
      console.log('UserRepository: Attempting to archive user:', userId);
      
      const { error } = await supabase
        .from('profiles')
        .update({
          is_archived: true,
          archived_at: new Date().toISOString(),
          archived_by: archivedBy,
          archive_reason: reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
      
      if (error) {
        console.error('UserRepository: Archive error:', error);
        logger.error('User repository archive error', error, { userId, archivedBy });
        throw error;
      }
      
      // Also deactivate their access code
      await supabase
        .from('access_codes')
        .update({ is_active: false })
        .eq('used_by', userId);
      
      console.log('UserRepository: Archive operation completed');
      logger.info('User archived successfully from repository', { userId, archivedBy });
    } catch (error) {
      console.error('UserRepository: Archive failed:', error);
      logger.error('User repository archive failed', error, { userId, archivedBy });
      throw error;
    }
  }

  async unarchiveUser(userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          is_archived: false,
          archived_at: null,
          archived_by: null,
          archive_reason: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
      
      if (error) {
        logger.error('User repository unarchive error', error, { userId });
        throw error;
      }
      
      // Reactivate their access code
      await supabase
        .from('access_codes')
        .update({ is_active: true })
        .eq('used_by', userId);
      
      logger.info('User unarchived successfully from repository', { userId });
    } catch (error) {
      logger.error('User repository unarchive failed', error, { userId });
      throw error;
    }
  }

  async findAllIncludingArchived(filter?: Record<string, any>): Promise<User[]> {
    try {
      // Query profiles with access codes and deliberations for ALL users including archived
      let query = supabase
        .from('user_profiles_with_deliberations_with_codes')
        .select('*');
      
      if (filter) {
        Object.entries(filter).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
      }
      
      const { data, error } = await query;
      
      if (error) {
        logger.error('User repository findAllIncludingArchived failed', error, { filter });
        throw error;
      }
      
      return (data || []).map(item => ({
        id: item.id,
        accessCode: item.access_code || '',
        role: item.user_role || 'user',
        profile: {
          displayName: '',
          avatarUrl: '',
          bio: '',
          expertiseAreas: [],
        },
        deliberations: Array.isArray(item.deliberations) ? item.deliberations : [],
        isArchived: item.is_archived || false,
        archivedAt: item.archived_at,
        archivedBy: item.archived_by,
        archiveReason: item.archive_reason,
      })) as User[];
    } catch (error) {
      logger.error('User repository findAllIncludingArchived failed', error, { filter });
      throw error;
    }
  }

}