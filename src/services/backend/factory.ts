import { BACKEND_CONFIG } from '@/config/backend';
import { IAuthService, IMessageService, IRealtimeService } from './base.service';

// Supabase services
import { SupabaseAuthService } from './supabase/auth.service';
import { SupabaseMessageService } from './supabase/message.service';
import { SupabaseRealtimeService } from './supabase/realtime.service';

// Node.js services
import { NodeJSAuthService } from './nodejs/auth.service';
import { NodeJSMessageService } from './nodejs/message.service';
import { NodeJSRealtimeService } from './nodejs/realtime.service';

class BackendServiceFactory {
  private authService: IAuthService | null = null;
  private messageService: IMessageService | null = null;
  private realtimeService: IRealtimeService | null = null;

  getAuthService(): IAuthService {
    if (!this.authService) {
      this.authService = BACKEND_CONFIG.type === 'supabase' 
        ? new SupabaseAuthService()
        : new NodeJSAuthService();
    }
    return this.authService;
  }

  getMessageService(): IMessageService {
    if (!this.messageService) {
      if (BACKEND_CONFIG.type === 'supabase') {
        this.messageService = new SupabaseMessageService();
      } else {
        const authService = this.getAuthService();
        this.messageService = new NodeJSMessageService(() => authService.getToken());
      }
    }
    return this.messageService;
  }

  getRealtimeService(): IRealtimeService {
    if (!this.realtimeService) {
      if (BACKEND_CONFIG.type === 'supabase') {
        this.realtimeService = new SupabaseRealtimeService();
      } else {
        const authService = this.getAuthService();
        this.realtimeService = new NodeJSRealtimeService(() => authService.getToken());
      }
    }
    return this.realtimeService;
  }

  // Reset services (useful for testing or switching backends)
  reset(): void {
    this.authService = null;
    this.messageService = null;
    this.realtimeService = null;
  }
}

export const backendServiceFactory = new BackendServiceFactory();
export default backendServiceFactory;