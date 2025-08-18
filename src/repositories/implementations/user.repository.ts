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
      // Query auth.users with profiles and user roles
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
      
      if (authError) {
        logger.error('User repository findAll auth error', authError, { filter });
        throw authError;
      }

      if (!authUsers?.users) {
        return [];
      }

      // Get profiles and roles for these users
      const userIds = authUsers.users.map(user => user.id);
      
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select(`
          id,
          is_archived,
          archived_at,
          archived_by,
          archive_reason
        `)
        .in('id', userIds)
        .or('is_archived.is.null,is_archived.eq.false'); // Exclude archived users

      if (profileError) {
        logger.error('User repository profiles error', profileError);
        throw profileError;
      }

      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', userIds);

      if (rolesError) {
        logger.error('User repository roles error', rolesError);
        throw rolesError;
      }

      // Get deliberations for these users
      const { data: participants, error: participantsError } = await supabase
        .from('participants')
        .select(`
          user_id,
          deliberations!inner(id, title, status)
        `)
        .in('user_id', userIds.map(id => id.toString()));

      if (participantsError) {
        logger.error('User repository participants error', participantsError);
      }

      // Map auth users to our User interface
      const profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);
      const rolesMap = new Map(userRoles?.map(r => [r.user_id, r.role]) || []);
      const deliberationsMap = new Map();
      
      // Group deliberations by user  
      participants?.forEach((p: any) => {
        const userId = p.user_id.toString();
        if (!deliberationsMap.has(userId)) {
          deliberationsMap.set(userId, []);
        }
        if (p.deliberations) {
          deliberationsMap.get(userId).push({
            id: p.deliberations.id,
            title: p.deliberations.title,
            role: 'participant'
          });
        }
      });

      return authUsers.users
        .filter(user => {
          const profile = profilesMap.get(user.id);
          return !profile?.is_archived; // Only include non-archived users
        })
        .map(user => {
          const profile = profilesMap.get(user.id);
          const role = rolesMap.get(user.id) || 'user';
          const deliberations = deliberationsMap.get(user.id.toString()) || [];

          return {
            id: user.id,
            email: user.email || '',
            emailConfirmedAt: user.email_confirmed_at,
            createdAt: user.created_at,
            lastSignInAt: user.last_sign_in_at,
            role: role,
            profile: {
              displayName: user.user_metadata?.display_name || '',
              avatarUrl: user.user_metadata?.avatar_url || '',
              bio: user.user_metadata?.bio || '',
              expertiseAreas: user.user_metadata?.expertise_areas || [],
            },
            deliberations: deliberations,
            isArchived: profile?.is_archived || false,
            archivedAt: profile?.archived_at,
            archivedBy: profile?.archived_by,
            archiveReason: profile?.archive_reason,
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
      // For archived users, we need to query auth.users too
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
      
      if (authError) {
        logger.error('User repository findAllIncludingArchived auth error', authError);
        throw authError;
      }

      if (!authUsers?.users) {
        return [];
      }

      // Get all profiles including archived
      const userIds = authUsers.users.map(user => user.id);
      
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select(`
          id,
          is_archived,
          archived_at,
          archived_by,
          archive_reason
        `)
        .in('id', userIds);

      if (profileError) {
        logger.error('User repository profiles error', profileError);
        throw profileError;
      }

      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', userIds);

      if (rolesError) {
        logger.error('User repository roles error', rolesError);
      }

      const profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);
      const rolesMap = new Map(userRoles?.map(r => [r.user_id, r.role]) || []);

      return authUsers.users.map(user => {
        const profile = profilesMap.get(user.id);
        const role = rolesMap.get(user.id) || 'user';

        return {
          id: user.id,
          email: user.email || '',
          emailConfirmedAt: user.email_confirmed_at,
          createdAt: user.created_at,
          lastSignInAt: user.last_sign_in_at,
          role: role,
          profile: {
            displayName: user.user_metadata?.display_name || '',
            avatarUrl: user.user_metadata?.avatar_url || '',
            bio: user.user_metadata?.bio || '',
            expertiseAreas: user.user_metadata?.expertise_areas || [],
          },
          deliberations: [],
          isArchived: profile?.is_archived || false,
          archivedAt: profile?.archived_at,
          archivedBy: profile?.archived_by,
          archiveReason: profile?.archive_reason,
        } as User;
      });
    } catch (error) {
      logger.error('User repository findAllIncludingArchived failed', error, { filter });
      throw error;
    }
  }

}