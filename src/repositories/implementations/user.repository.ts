import { supabase } from '@/integrations/supabase/client';
import { SupabaseBaseRepository } from './supabase-base.repository';
import { IUserRepository } from '../interfaces';
import { User } from '@/types/api';
import { logger } from '@/utils/logger';

export class UserRepository extends SupabaseBaseRepository implements IUserRepository {
  
  async findById(id: string): Promise<User | null> {
    return this.findByIdFromTable('profiles', id);
  }

  async create(data: any): Promise<User> {
    return this.createInTable('profiles', data);
  }

  async update(id: string, data: any): Promise<User> {
    return this.updateInTable('profiles', id, data);
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
      } as User;
    } catch (error) {
      logger.error('User repository findByEmail failed', error, { email });
      throw error;
    }
  }

  async updateRole(userId: string, role: string): Promise<void> {
    try {
      // Update both the profiles table and user_roles table
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (profileError) {
        logger.error('User repository updateRole profile error', profileError, { userId, role });
        throw profileError;
      }

      // Update or insert user role
      const { error: roleError } = await supabase
        .from('user_roles')
        .upsert({ 
          user_id: userId, 
          role: role as any,
          created_at: new Date().toISOString()
        });

      if (roleError) {
        logger.error('User repository updateRole role error', roleError, { userId, role });
        throw roleError;
      }

      logger.info('User role updated successfully', { userId, role });
    } catch (error) {
      logger.error('User repository updateRole failed', error, { userId, role });
      throw error;
    }
  }

  // Using profiles table directly instead of auth.admin API
  async findAll(filter?: Record<string, any>): Promise<User[]> {
    try {
      // Query profiles with user roles and deliberations
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select(`
          *,
          user_roles (role),
          participants (
            role,
            deliberations (
              id,
              title
            )
          )
        `)
        .eq('is_archived', false); // Only non-archived users
      
      if (profilesError) {
        logger.error('User repository findAll profiles error', profilesError, { filter });
        throw profilesError;
      }

      logger.info('User repository findAll profiles fetched', { count: profiles?.length });

      if (!profiles) {
        return [];
      }

      return profiles.map(profile => {
        const role = profile.user_roles?.[0]?.role || 'user';
        const deliberations = profile.participants?.map((p: any) => ({
          id: p.deliberations?.id || '',
          title: p.deliberations?.title || '',
          role: p.role || 'participant'
        })) || [];

        return {
          id: profile.id,
          email: profile.migrated_from_access_code || `user-${profile.id.slice(0, 8)}@example.com`, // Fallback email
          emailConfirmedAt: profile.created_at,
          createdAt: profile.created_at,
          lastSignInAt: profile.updated_at,
          role: role,
          profile: {
            displayName: `User ${profile.id.slice(0, 8)}`,
            avatarUrl: '',
            bio: '',
            expertiseAreas: [],
          },
          deliberations: deliberations,
          isArchived: profile.is_archived || false,
          archivedAt: profile.archived_at,
          archivedBy: profile.archived_by,
          archiveReason: profile.archive_reason,
        } as User;
      });
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
      
      logger.info('User unarchived successfully from repository', { userId });
    } catch (error) {
      logger.error('User repository unarchive failed', error, { userId });
      throw error;
    }
  }

  async findAllIncludingArchived(filter?: Record<string, any>): Promise<User[]> {
    try {
      // Query all profiles including archived ones
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select(`
          *,
          user_roles (role),
          participants (
            role,
            deliberations (
              id,
              title
            )
          )
        `);
      
      if (profilesError) {
        logger.error('User repository findAllIncludingArchived profiles error', profilesError);
        throw profilesError;
      }

      if (!profiles) {
        return [];
      }

      return profiles.map(profile => {
        const role = profile.user_roles?.[0]?.role || 'user';
        const deliberations = profile.participants?.map((p: any) => ({
          id: p.deliberations?.id || '',
          title: p.deliberations?.title || '',
          role: p.role || 'participant'
        })) || [];

        return {
          id: profile.id,
          email: profile.migrated_from_access_code || `user-${profile.id.slice(0, 8)}@example.com`,
          emailConfirmedAt: profile.created_at,
          createdAt: profile.created_at,
          lastSignInAt: profile.updated_at,
          role: role,
          profile: {
            displayName: `User ${profile.id.slice(0, 8)}`,
            avatarUrl: '',
            bio: '',
            expertiseAreas: [],
          },
          deliberations: deliberations,
          isArchived: profile.is_archived || false,
          archivedAt: profile.archived_at,
          archivedBy: profile.archived_by,
          archiveReason: profile.archive_reason,
        } as User;
      });
    } catch (error) {
      logger.error('User repository findAllIncludingArchived failed', error, { filter });
      throw error;
    }
  }
}