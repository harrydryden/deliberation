import { IUserService } from '../interfaces';
import { IUserRepository } from '@/repositories/interfaces';
import { User } from '@/types/index';
import { logger } from '@/utils/logger';

export class UserService implements IUserService {
  constructor(private userRepository: IUserRepository) {}

  async getUsers(filter?: Record<string, any>): Promise<User[]> {
    try {
      return await this.userRepository.findAll(filter);
    } catch (error) {
      logger.error('User service getUsers failed', { error, filter });
      throw error;
    }
  }

  async getUserById(id: string): Promise<User | null> {
    try {
      return await this.userRepository.findById(id);
    } catch (error) {
      logger.error('User service getUserById failed', { error, userId: id });
      throw error;
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    try {
      return await this.userRepository.findByEmail(email);
    } catch (error) {
      logger.error('User service getUserByEmail failed', { error, email });
      throw error;
    }
  }

  async updateUser(id: string, user: Partial<User>): Promise<User> {
    try {
      const updatedUser = await this.userRepository.update(id, user);
      
      logger.info('User updated successfully', { 
        userId: id, 
        updatedFields: Object.keys(user) 
      });
      
      return updatedUser;
    } catch (error) {
      logger.error('User service updateUser failed', { error, userId: id });
      throw error;
    }
  }

  async updateUserRole(userId: string, role: string): Promise<void> {
    try {
      await this.userRepository.updateRole(userId, role);
      
      logger.info('User role updated successfully', { userId, role });
    } catch (error) {
      logger.error('User service updateUserRole failed', { error, userId, role });
      throw error;
    }
  }


  async archiveUser(userId: string, archivedBy: string, reason?: string): Promise<void> {
    try {
      logger.debug('UserService: Starting archiving for user:', userId);
      
      // First check if user exists
      const existingUser = await this.userRepository.findById(userId);
      logger.debug('UserService: User found before archiving:', existingUser);
      
      if (!existingUser) {
        logger.warn('UserService: User not found, cannot archive');
        throw new Error('User not found');
      }
      
      if (existingUser.isArchived) {
        throw new Error('User is already archived');
      }
      
      await this.userRepository.archiveUser(userId, archivedBy, reason);
      
      logger.info('User archived successfully', { userId, archivedBy, reason });
    } catch (error) {
      logger.error('UserService: Archive user failed:', error);
      logger.error('User service archiveUser failed', { error, userId, archivedBy });
      throw error;
    }
  }

  async unarchiveUser(userId: string): Promise<void> {
    try {
      logger.debug('UserService: Starting unarchiving for user:', userId);
      
      // Check if user exists and is archived
      const existingUser = await this.userRepository.findAllIncludingArchived({ id: userId });
      const user = existingUser.find(u => u.id === userId);
      
      if (!user) {
        throw new Error('User not found');
      }
      
      if (!user.isArchived) {
        throw new Error('User is not archived');
      }
      
      await this.userRepository.unarchiveUser(userId);
      
      logger.info('User unarchived successfully', { userId });
    } catch (error) {
      logger.error('UserService: Unarchive user failed:', error);
      logger.error('User service unarchiveUser failed', { error, userId });
      throw error;
    }
  }

  async getAllUsersIncludingArchived(filter?: Record<string, any>): Promise<User[]> {
    try {
      return await this.userRepository.findAllIncludingArchived(filter);
    } catch (error) {
      logger.error('User service getAllUsersIncludingArchived failed', { error, filter });
      throw error;
    }
  }
}