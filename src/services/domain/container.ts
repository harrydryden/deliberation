import { UserRepository } from '@/repositories/implementations/user.repository';
import { AdminRepository } from '@/repositories/implementations/admin.repository';
import { AgentRepository } from '@/repositories/implementations/agent.repository';
import { MessageRepository } from '@/repositories/implementations/message.repository';
import { UserService } from './implementations/user.service';
import { AdminService } from './implementations/admin.service';
import { UnifiedAgentService } from './implementations/unified-agent.service';
import { MessageService } from './implementations/message.service';
import { RealtimeService } from './implementations/realtime.service';
import { PromptService } from './implementations/prompt.service';
import { StanceService } from './implementations/stance.service';
import { IBISService } from './implementations/ibis.service';

// Create repository instances
const userRepository = new UserRepository();
const adminRepository = new AdminRepository();
const agentRepository = new AgentRepository();
const messageRepository = new MessageRepository();

// Create service instances
const userService = new UserService(userRepository);
const agentService = new UnifiedAgentService(agentRepository);
const messageService = new MessageService(messageRepository);
const realtimeService = new RealtimeService();
const promptService = new PromptService();
const stanceService = new StanceService();
const ibisService = new IBISService();

const adminService = new AdminService(
  adminRepository,
  userService,
  agentService
);

// Export service container
export const serviceContainer = {
  userService,
  adminService,
  agentService,
  messageService,
  realtimeService,
  promptService,
  stanceService,
  ibisService,
};

// Export individual services for convenience
export const {
  userService: userServiceInstance,
  adminService: adminServiceInstance,
  agentService: agentServiceInstance,
  messageService: messageServiceInstance,
  realtimeService: realtimeServiceInstance,
  promptService: promptServiceInstance,
  stanceService: stanceServiceInstance,
  ibisService: ibisServiceInstance
} = serviceContainer;