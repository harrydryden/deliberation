import { UserRepository } from '@/repositories/implementations/user.repository';
import { AdminRepository } from '@/repositories/implementations/admin.repository';
import { AgentRepository } from '@/repositories/implementations/agent.repository';
import { DeliberationRepository } from '@/repositories/implementations/deliberation.repository';
import { MessageRepository } from '@/repositories/implementations/message.repository';
import { UserService } from './implementations/user.service';
import { AdminService } from './implementations/admin.service';
import { AgentService } from './implementations/agent.service';
import { DeliberationService } from './implementations/deliberation.service';
import { MessageService } from './implementations/message.service';
import { RealtimeService } from './implementations/realtime.service';
import { PromptService } from './implementations/prompt.service';

// Create repository instances
const userRepository = new UserRepository();
const adminRepository = new AdminRepository();
const agentRepository = new AgentRepository();
const deliberationRepository = new DeliberationRepository();
const messageRepository = new MessageRepository();

// Create service instances
const userService = new UserService(userRepository);
const agentService = new AgentService(agentRepository);
const deliberationService = new DeliberationService(deliberationRepository);
const messageService = new MessageService(messageRepository);
const realtimeService = new RealtimeService();
const promptService = new PromptService();

const adminService = new AdminService(
  adminRepository,
  userService,
  agentService,
  deliberationService,
  null as any  // accessCodeService - deprecated
);

// Export service container
export const serviceContainer = {
  userService,
  adminService,
  agentService,
  deliberationService,
  messageService,
  realtimeService,
  promptService,
};

// Export individual services for convenience
export const {
  userService: userServiceInstance,
  adminService: adminServiceInstance,
  agentService: agentServiceInstance,
  deliberationService: deliberationServiceInstance,
  messageService: messageServiceInstance,
  realtimeService: realtimeServiceInstance,
  promptService: promptServiceInstance
} = serviceContainer;