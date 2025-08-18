import { UserRepository } from '@/repositories/implementations/user.repository';
import { AdminRepository } from '@/repositories/implementations/admin.repository';
import { UserService } from './implementations/user.service';
import { AdminService } from './implementations/admin.service';

// Create repository instances
const userRepository = new UserRepository();
const adminRepository = new AdminRepository();

// Create service instances
const userService = new UserService(userRepository);
const adminService = new AdminService(
  adminRepository,
  userService,
  null as any, // agentService - not needed for user management
  null as any, // deliberationService - not needed for user management
  null as any  // accessCodeService - deprecated
);

// Export service container
export const serviceContainer = {
  userService,
  adminService,
};

// Export individual services for convenience
export const { userService: userServiceInstance, adminService: adminServiceInstance } = serviceContainer;