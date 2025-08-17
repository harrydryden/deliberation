import { AuthResponse, User } from '@/types/api';
import { AuthenticationError } from '@/utils/errors';

const TOKEN_KEY = 'auth_token';

export class AuthService {
  private token: string | null = null;

  constructor() {
    this.token = this.getStoredToken();
  }

  private getStoredToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  setToken(token: string | null): void {
    this.token = token;
    try {
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch (error) {
      console.warn('Failed to store token:', error);
    }
  }

  getToken(): string | null {
    return this.token;
  }

  hasValidToken(): boolean {
    if (!this.token) return false;
    
    // WARNING: Client-side JWT validation is NOT secure
    // This is only for UX - all security validation must happen server-side
    try {
      const payload = this.parseTokenPayload(this.token);
      // Add buffer time to account for clock skew
      const bufferTime = 30; // 30 seconds
      return payload.exp > (Date.now() / 1000) + bufferTime;
    } catch {
      return false;
    }
  }

  private parseTokenPayload(token: string): any {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new AuthenticationError('Invalid token format');
    }
    
    try {
      // WARNING: This does NOT verify the JWT signature
      // Client-side JWT parsing is INSECURE and only for UX
      // All actual authentication must be verified server-side
      const payload = parts[1];
      const padded = payload + '='.repeat((4 - payload.length % 4) % 4);
      const decoded = atob(padded);
      return JSON.parse(decoded);
    } catch {
      throw new AuthenticationError('Failed to parse token');
    }
  }

  getUserFromToken(): User | null {
    if (!this.hasValidToken()) return null;
    
    try {
      const payload = this.parseTokenPayload(this.token!);
      return {
        id: payload.accessCode, // Use access code as the user ID
        profile: null, // Will be fetched separately
      };
    } catch {
      return null;
    }
  }

  clearAuth(): void {
    this.setToken(null);
  }
}

export const authService = new AuthService();