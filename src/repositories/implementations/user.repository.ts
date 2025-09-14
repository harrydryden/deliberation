import { supabase } from '@/integrations/supabase/client';
import { SupabaseBaseRepository } from './supabase-base.repository';
import { IUserRepository } from '../interfaces';
import { User } from '@/types/index';
import { logger } from '@/utils/logger';

export class UserRepository extends SupabaseBaseRepository implements IUserRepository {
  
  async findById(id: string): Promise<User | null> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      
      return this.mapToUser(data);
    } catch (error) {
      logger.error('User repository findById failed', error as Error, { id });
      throw error;
    }
  }

  async create(data: any): Promise<User> {
    try {
      const { data: result, error } = await supabase
        .from('profiles')
        .insert(data)
        .select()
        .single();
      
      if (error) throw error;
      return this.mapToUser(result);
    } catch (error) {
      logger.error('User repository create failed', error as Error, { data });
      throw error;
    }
  }

  async update(id: string, data: any): Promise<User> {
    try {
      const { data: result, error } = await supabase
        .from('profiles')
        .update(data)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return this.mapToUser(result);
    } catch (error) {
      logger.error('User repository update failed', error as Error, { id, data });
      throw error;
    }
  }

  private mapToUser(data: any): User {
    return {
      id: data.id,
      email: data.email || '',
      emailConfirmedAt: data.email_confirmed_at,
      createdAt: data.created_at,
      lastSignInAt: data.last_sign_in_at,
      profile: null,
      role: data.role,
      isArchived: data.is_archived,
      archivedAt: data.archived_at,
      archivedBy: data.archived_by,
      archiveReason: data.archive_reason,
      accessCode1: data.access_code_1,
      accessCode2: data.access_code_2
    };
  }

  async delete(id: string): Promise<void> {
    return this.deleteFromTable('profiles', id);
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
        email: profile.email || '',
        emailConfirmedAt: profile.email_confirmed_at,
        createdAt: profile.created_at,
        lastSignInAt: profile.last_sign_in_at,
        role: profile.user_role || 'user',
        profile: {
          displayName: profile.display_name || '',
          avatarUrl: profile.avatar_url || '',
          bio: profile.bio || '',
          expertiseAreas: profile.expertise_areas || [],
        },
        accessCode1: profile.access_code_1,
        accessCode2: profile.access_code_2
      } as User;
    } catch (error) {
      logger.error('User repository findByEmail failed', error, { email });
      throw error;
    }
  }

  async updateRole(userId: string, role: string): Promise<void> {
    try {
      // Update the profiles table with the new role
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          user_role: role as any,
          updated_at: new Date().toISOString() 
        })
        .eq('id', userId);

      if (profileError) {
        logger.error('User repository updateRole profile error', profileError, { userId, role });
        throw profileError;
      }

      logger.info('User role updated successfully', { userId, role });
    } catch (error) {
      logger.error('User repository updateRole failed', error, { userId, role });
      throw error;
    }
  }

  async findAll(filter?: Record<string, any>): Promise<User[]> {
    try {
      // Simple direct database query - no edge functions needed!
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_archived', false);

      if (profilesError) {
        throw profilesError;
      }

      if (!profiles || profiles.length === 0) {
        return [];
      }

      // User roles are now in profiles table directly

      // Get participants with deliberations
      const userIds = profiles.map(p => p.id);
      const { data: participants } = await supabase
        .from('participants')
        .select(`
          user_id,
          role,
          deliberations (
            id,
            title
          )
        `)
        .in('user_id', userIds.map(id => id.toString()));

      // Create map for efficient lookups
      const deliberationsMap = new Map();
      
      // Initialize deliberations map
      profiles.forEach(profile => {
        deliberationsMap.set(profile.id, []);
      });

      // Populate deliberations map
      participants?.forEach((p) => {
        const userId = p.user_id;
        if (deliberationsMap.has(userId) && p.deliberations && typeof p.deliberations === 'object') {
          deliberationsMap.get(userId).push({
            id: (p.deliberations as any).id,
            title: (p.deliberations as any).title,
            role: p.role || 'participant'
          });
        }
      });

      // Map users - access codes and roles now come directly from the database!
      const users: User[] = profiles.map(profile => {
        const role = profile.user_role || 'user';
        const deliberations = deliberationsMap.get(profile.id) || [];
        
        return {
          id: profile.id,
          email: profile.access_code_1 ? `${profile.access_code_1}@deliberation.local` : '',
          emailConfirmedAt: profile.created_at,
          createdAt: profile.created_at,
          lastSignInAt: profile.updated_at,
          role: role,
          profile: {
            displayName: profile.access_code_1 ? `User ${profile.access_code_1}` : `User ${profile.id.slice(0, 8)}`,
            avatarUrl: '',
            bio: '',
            expertiseAreas: [],
          },
          deliberations: deliberations,
          isArchived: profile.is_archived || false,
          archivedAt: profile.archived_at,
          archivedBy: profile.archived_by,
          archiveReason: profile.archive_reason,
          accessCode1: profile.access_code_1,
          accessCode2: profile.access_code_2
        };
      });

      logger.info('User repository findAll users fetched directly', { count: users.length });
      return users;
    } catch (error) {
      logger.error('User repository findAll failed', error, { filter });
      throw error;
    }
  }

  async archiveUser(userId: string, archivedBy: string, reason?: string): Promise<void> {
    try {
      logger.debug('UserRepository: Attempting to archive user:', userId);
      
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
        logger.error('UserRepository: Archive error:', error);
        logger.error('User repository archive error', error, { userId, archivedBy });
        throw error;
      }
      
      logger.debug('UserRepository: Archive operation completed');
      logger.info('User archived successfully from repository', { userId, archivedBy });
    } catch (error) {
      logger.error('UserRepository: Archive failed:', error);
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
      
      logger.info('User unarchived successfully from repository', { userId });
    } catch (error) {
      logger.error('User repository unarchive failed', error, { userId });
      throw error;
    }
  }

  async findAllIncludingArchived(filter?: Record<string, any>): Promise<User[]> {
    try {
      // For now, use the same edge function but we might need to modify it to include archived users
      return this.findAll(filter);
    } catch (error) {
      logger.error('User repository findAllIncludingArchived failed', error, { filter });
      throw error;
    }
  }
}