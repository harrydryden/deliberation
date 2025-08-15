import { IUserService } from '../interfaces';
import { IUserRepository } from '@/repositories/interfaces';
import { User } from '@/types/api';
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

  async deleteUser(id: string): Promise<void> {
    try {
      console.log('UserService: Starting deletion for user:', id);
      
      // First check if user exists
      const existingUser = await this.userRepository.findById(id);
      console.log('UserService: User found before deletion:', existingUser);
      
      if (!existingUser) {
        console.log('UserService: User not found, cannot delete');
        throw new Error('User not found');
      }
      
      await this.userRepository.delete(id);
      
      // Verify deletion
      const deletedUser = await this.userRepository.findById(id);
      console.log('UserService: User after deletion attempt:', deletedUser);
      
      logger.info('User deleted successfully', { userId: id });
    } catch (error) {
      console.error('UserService: Delete user failed:', error);
      logger.error('User service deleteUser failed', { error, userId: id });
      throw error;
    }
  }
}