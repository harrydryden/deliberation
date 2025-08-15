// Dependency injection container following IoC principles
import { 
  IUserRepository, 
  IMessageRepository, 
  IAgentRepository, 
  IDeliberationRepository, 
  IAccessCodeRepository,
  IAdminRepository 
} from '@/repositories/interfaces';

import {
  IAuthService,
  IMessageService,
  IAgentService,
  IDeliberationService,
  IUserService,
  IAccessCodeService,
  IAdminService,
  IRealtimeService
} from './interfaces';

// Repository implementations
import { UserRepository } from '@/repositories/implementations/user.repository';
import { MessageRepository } from '@/repositories/implementations/message.repository';
import { AgentRepository } from '@/repositories/implementations/agent.repository';
import { DeliberationRepository } from '@/repositories/implementations/deliberation.repository';
import { AccessCodeRepository } from '@/repositories/implementations/access-code.repository';
import { AdminRepository } from '@/repositories/implementations/admin.repository';

// Service implementations
import { AuthService } from './implementations/auth.service';
import { MessageService } from './implementations/message.service';
import { AgentService } from './implementations/agent.service';
import { DeliberationService } from './implementations/deliberation.service';
import { UserService } from './implementations/user.service';
import { AccessCodeService } from './implementations/access-code.service';
import { AdminService } from './implementations/admin.service';
import { RealtimeService } from './implementations/realtime.service';

class ServiceContainer {
  private static instance: ServiceContainer;
  
  // Repository instances (singletons)
  private _userRepository: IUserRepository | null = null;
  private _messageRepository: IMessageRepository | null = null;
  private _agentRepository: IAgentRepository | null = null;
  private _deliberationRepository: IDeliberationRepository | null = null;
  private _accessCodeRepository: IAccessCodeRepository | null = null;
  private _adminRepository: IAdminRepository | null = null;

  // Service instances (singletons)
  private _authService: IAuthService | null = null;
  private _messageService: IMessageService | null = null;
  private _agentService: IAgentService | null = null;
  private _deliberationService: IDeliberationService | null = null;
  private _userService: IUserService | null = null;
  private _accessCodeService: IAccessCodeService | null = null;
  private _adminService: IAdminService | null = null;
  private _realtimeService: IRealtimeService | null = null;

  private constructor() {}

  static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer();
    }
    return ServiceContainer.instance;
  }

  // Repository getters with lazy initialization
  get userRepository(): IUserRepository {
    if (!this._userRepository) {
      this._userRepository = new UserRepository();
    }
    return this._userRepository;
  }

  get messageRepository(): IMessageRepository {
    if (!this._messageRepository) {
      this._messageRepository = new MessageRepository();
    }
    return this._messageRepository;
  }

  get agentRepository(): IAgentRepository {
    if (!this._agentRepository) {
      this._agentRepository = new AgentRepository();
    }
    return this._agentRepository;
  }

  get deliberationRepository(): IDeliberationRepository {
    if (!this._deliberationRepository) {
      this._deliberationRepository = new DeliberationRepository();
    }
    return this._deliberationRepository;
  }

  get accessCodeRepository(): IAccessCodeRepository {
    if (!this._accessCodeRepository) {
      this._accessCodeRepository = new AccessCodeRepository();
    }
    return this._accessCodeRepository;
  }

  get adminRepository(): IAdminRepository {
    if (!this._adminRepository) {
      this._adminRepository = new AdminRepository();
    }
    return this._adminRepository;
  }

  // Service getters with dependency injection
  get authService(): IAuthService {
    if (!this._authService) {
      this._authService = new AuthService(this.userRepository);
    }
    return this._authService;
  }

  get messageService(): IMessageService {
    if (!this._messageService) {
      this._messageService = new MessageService(this.messageRepository);
    }
    return this._messageService;
  }

  get agentService(): IAgentService {
    if (!this._agentService) {
      this._agentService = new AgentService(this.agentRepository);
    }
    return this._agentService;
  }

  get deliberationService(): IDeliberationService {
    if (!this._deliberationService) {
      this._deliberationService = new DeliberationService(this.deliberationRepository);
    }
    return this._deliberationService;
  }

  get userService(): IUserService {
    if (!this._userService) {
      this._userService = new UserService(this.userRepository);
    }
    return this._userService;
  }

  get accessCodeService(): IAccessCodeService {
    if (!this._accessCodeService) {
      this._accessCodeService = new AccessCodeService(this.accessCodeRepository);
    }
    return this._accessCodeService;
  }

  get adminService(): IAdminService {
    if (!this._adminService) {
      this._adminService = new AdminService(
        this.adminRepository,
        this.userService,
        this.agentService,
        this.deliberationService,
        this.accessCodeService
      );
    }
    return this._adminService;
  }

  get realtimeService(): IRealtimeService {
    if (!this._realtimeService) {
      this._realtimeService = new RealtimeService();
    }
    return this._realtimeService;
  }

  // Reset method for testing
  reset(): void {
    this._userRepository = null;
    this._messageRepository = null;
    this._agentRepository = null;
    this._deliberationRepository = null;
    this._accessCodeRepository = null;
    this._adminRepository = null;
    this._authService = null;
    this._messageService = null;
    this._agentService = null;
    this._deliberationService = null;
    this._userService = null;
    this._accessCodeService = null;
    this._adminService = null;
    this._realtimeService = null;
  }
}

// Export singleton instance
export const serviceContainer = ServiceContainer.getInstance();

// Export individual services for convenience
export const authService = serviceContainer.authService;
export const messageService = serviceContainer.messageService;
export const agentService = serviceContainer.agentService;
export const deliberationService = serviceContainer.deliberationService;
export const userService = serviceContainer.userService;
export const accessCodeService = serviceContainer.accessCodeService;
export const adminService = serviceContainer.adminService;
export const realtimeService = serviceContainer.realtimeService;