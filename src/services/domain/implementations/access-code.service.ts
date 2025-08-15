import { IAccessCodeService } from '../interfaces';
import { IAccessCodeRepository } from '@/repositories/interfaces';
import { AccessCode } from '@/repositories/implementations/access-code.repository';
import { logger } from '@/utils/logger';

export class AccessCodeService implements IAccessCodeService {
  constructor(private accessCodeRepository: IAccessCodeRepository) {}

  async getAccessCodes(): Promise<AccessCode[]> {
    try {
      return await this.accessCodeRepository.findAll();
    } catch (error) {
      logger.error('Access code service getAccessCodes failed', { error });
      throw error;
    }
  }

  async getUnusedAccessCodes(): Promise<AccessCode[]> {
    try {
      return await this.accessCodeRepository.findUnused();
    } catch (error) {
      logger.error('Access code service getUnusedAccessCodes failed', { error });
      throw error;
    }
  }

  async validateAccessCode(code: string): Promise<AccessCode | null> {
    try {
      const accessCode = await this.accessCodeRepository.findByCode(code);
      
      if (!accessCode) {
        return null;
      }

      // Check if code is valid and not expired
      if (!accessCode.is_active || 
          (accessCode.expires_at && new Date(accessCode.expires_at) < new Date()) ||
          (accessCode.max_uses && accessCode.current_uses >= accessCode.max_uses)) {
        return null;
      }

      return accessCode;
    } catch (error) {
      logger.error('Access code service validateAccessCode failed', { error, code: code.slice(0, 4) + '***' });
      throw error;
    }
  }

  async createAccessCode(codeType: string): Promise<AccessCode> {
    try {
      const accessCode = await this.accessCodeRepository.create(codeType);
      
      logger.info('Access code created successfully', { 
        codeId: accessCode.id, 
        codeType 
      });
      
      return accessCode;
    } catch (error) {
      logger.error('Access code service createAccessCode failed', { error, codeType });
      throw error;
    }
  }

  async deleteAccessCode(id: string): Promise<void> {
    try {
      await this.accessCodeRepository.delete(id);
      
      logger.info('Access code deleted successfully', { codeId: id });
    } catch (error) {
      logger.error('Access code service deleteAccessCode failed', { error, codeId: id });
      throw error;
    }
  }
}