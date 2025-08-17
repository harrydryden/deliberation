import { IDeliberationService } from '../interfaces';
import { IDeliberationRepository } from '@/repositories/interfaces';
import { Deliberation } from '@/types/api';
import { logger } from '@/utils/logger';

export class DeliberationService implements IDeliberationService {
  constructor(private deliberationRepository: IDeliberationRepository) {}

  async getDeliberations(filter?: Record<string, any>): Promise<Deliberation[]> {
    try {
      return await this.deliberationRepository.findAll(filter);
    } catch (error) {
      logger.error('Deliberation service getDeliberations failed', { error, filter });
      throw error;
    }
  }

  async getPublicDeliberations(): Promise<Deliberation[]> {
    try {
      return await this.deliberationRepository.findPublic();
    } catch (error) {
      logger.error('Deliberation service getPublicDeliberations failed', { error });
      throw error;
    }
  }

  async getUserDeliberations(userId: string): Promise<Deliberation[]> {
    try {
      return await this.deliberationRepository.findByFacilitator(userId);
    } catch (error) {
      logger.error('Deliberation service getUserDeliberations failed', { error, userId });
      throw error;
    }
  }

  async createDeliberation(deliberation: Omit<Deliberation, 'id' | 'created_at' | 'updated_at'>): Promise<Deliberation> {
    try {
      const createdDeliberation = await this.deliberationRepository.create(deliberation);
      
      logger.info('Deliberation created successfully', { 
        deliberationId: createdDeliberation.id, 
        title: createdDeliberation.title 
      });
      
      return createdDeliberation;
    } catch (error) {
      logger.error('Deliberation service createDeliberation failed', { error, title: deliberation.title });
      throw error;
    }
  }

  async updateDeliberation(id: string, deliberation: Partial<Deliberation>): Promise<Deliberation> {
    try {
      const updatedDeliberation = await this.deliberationRepository.update(id, deliberation);
      
      logger.info('Deliberation updated successfully', { 
        deliberationId: id, 
        updatedFields: Object.keys(deliberation) 
      });
      
      return updatedDeliberation;
    } catch (error) {
      logger.error('Deliberation service updateDeliberation failed', { error, deliberationId: id });
      throw error;
    }
  }

  async deleteDeliberation(id: string): Promise<void> {
    try {
      await this.deliberationRepository.delete(id);
      
      logger.info('Deliberation deleted successfully', { deliberationId: id });
    } catch (error) {
      logger.error('Deliberation service deleteDeliberation failed', { error, deliberationId: id });
      throw error;
    }
  }
}