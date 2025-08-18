import { supabase, ensureUserContext } from '@/integrations/supabase/client';
import { IAccessCodeRepository } from '../interfaces';
import { logger } from '@/utils/logger';

export interface AccessCode {
  id: string;
  code: string;
  code_type: string;
  is_used: boolean;
  used_by?: string;
  used_at?: string;
  created_at: string;
  expires_at?: string;
  max_uses?: number;
  current_uses: number;
  is_active: boolean;
}

export class AccessCodeRepository implements IAccessCodeRepository {
  async findAll(): Promise<AccessCode[]> {
    try {
      // Ensure user context is set for RLS policies
      await ensureUserContext();
      
      const { data, error } = await supabase
        .from('access_codes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ error }, 'Access code repository findAll error');
        throw error;
      }

      return data as AccessCode[];
    } catch (error) {
      logger.error({ error }, 'Access code repository findAll failed');
      throw error;
    }
  }

  async findByCode(code: string): Promise<AccessCode | null> {
    try {
      const { data, error } = await supabase
        .from('access_codes')
        .select('*')
        .eq('code', code)
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.error({ error, code }, 'Access code repository findByCode error');
        throw error;
      }

      return data as AccessCode | null;
    } catch (error) {
      logger.error({ error, code }, 'Access code repository findByCode failed');
      throw error;
    }
  }

  async create(codeType: string): Promise<AccessCode> {
    try {
      // Ensure user context is set for RLS policies
      await ensureUserContext();
      
      // Generate a new access code using Supabase function
      const generatedCode = await this.generateSecureCode();
      
      const accessCodeData = {
        code: generatedCode,
        code_type: codeType,
        is_used: false,
        is_active: true,
        current_uses: 0,
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
      };

      const { data, error } = await supabase
        .from('access_codes')
        .insert(accessCodeData)
        .select()
        .single();

      if (error) {
        logger.error({ error, codeType }, 'Access code repository create error');
        throw error;
      }

      logger.info({ codeType, codeId: data.id }, 'Access code created successfully');
      return data as AccessCode;
    } catch (error) {
      logger.error({ error, codeType }, 'Access code repository create failed');
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      // Ensure user context is set for RLS policies
      await ensureUserContext();
      
      const { error } = await supabase
        .from('access_codes')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error({ error, id }, 'Access code repository delete error');
        throw error;
      }

      logger.info({ id }, 'Access code deleted successfully');
    } catch (error) {
      logger.error({ error, id }, 'Access code repository delete failed');
      throw error;
    }
  }

  async findUnused(): Promise<AccessCode[]> {
    try {
      const { data, error } = await supabase
        .from('access_codes')
        .select('*')
        .eq('is_used', false)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ error }, 'Access code repository findUnused error');
        throw error;
      }

      return data as AccessCode[];
    } catch (error) {
      logger.error({ error }, 'Access code repository findUnused failed');
      throw error;
    }
  }

  private async generateSecureCode(): Promise<string> {
    // Generate a cryptographically secure 10-digit access code
    const array = new Uint8Array(10);
    crypto.getRandomValues(array);
    
    let result = '';
    for (let i = 0; i < 10; i++) {
      // Generate random digit 0-9
      result += (array[i] % 10).toString();
    }
    
    return result;
  }
}