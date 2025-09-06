import { IDeliberationService } from '../interfaces';
import { IDeliberationRepository } from '@/repositories/interfaces';
import { Deliberation } from '@/types/index';
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

  async joinDeliberation(deliberationId: string): Promise<void> {
    try {
      logger.info('Starting joinDeliberation', { deliberationId });
      
      // Get the current user from Supabase auth
      const { data: { user }, error: userError } = await import('@/integrations/supabase/client').then(m => m.supabase.auth.getUser());
      
      if (userError || !user) {
        throw new Error('User not authenticated');
      }
      
      const userId = user.id;
      logger.info('Using authenticated user for join', { userId });
      
      // Check if already a participant
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: existing, error: existingError } = await supabase
        .from('participants')
        .select('id')
        .eq('deliberation_id', deliberationId)
        .eq('user_id', userId)
        .maybeSingle();

      if (existingError) {
        logger.error('Error checking existing participation', existingError);
      }

      if (existing) {
        logger.info('User is already a participant, skipping join');
        return;
      }

      // Add as participant
      const { error } = await supabase
        .from('participants')
        .insert({
          deliberation_id: deliberationId,
          user_id: userId,
          role: 'participant'
        });

      if (error) {
        // If it's a duplicate key error, the user is already a participant
        if (error.code === '23505' && error.message.includes('participants_deliberation_id_user_id_key')) {
          logger.info('User is already a participant (caught duplicate key error)');
          return; // Don't throw error, just return successfully
        }
        
        logger.error('Error adding participant', error);
        throw error;
      }

      logger.info('Successfully joined deliberation');
    } catch (error) {
      logger.error('Deliberation service joinDeliberation failed', { error, deliberationId });
      throw error;
    }
  }

  async leaveDeliberation(deliberationId: string): Promise<void> {
    try {
      logger.info('Starting leaveDeliberation', { deliberationId });
      
      // Get the current user from Supabase auth
      const { data: { user }, error: userError } = await import('@/integrations/supabase/client').then(m => m.supabase.auth.getUser());
      
      if (userError || !user) {
        throw new Error('User not authenticated');
      }
      
      const userId = user.id;

      const { supabase } = await import('@/integrations/supabase/client');
      const { error } = await supabase
        .from('participants')
        .delete()
        .eq('deliberation_id', deliberationId)
        .eq('user_id', userId);

      if (error) {
        logger.error('Error leaving deliberation', error);
        throw error;
      }
      
      logger.info('Successfully left deliberation');
    } catch (error) {
      logger.error('Deliberation service leaveDeliberation failed', { error, deliberationId });
      throw error;
    }
  }

  async getDeliberation(deliberationId: string): Promise<Deliberation | null> {
    try {
      return await this.deliberationRepository.findById(deliberationId);
    } catch (error) {
      logger.error('Deliberation service getDeliberation failed', { error, deliberationId });
      throw error;
    }
  }
}