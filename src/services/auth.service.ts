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
    
    try {
      const payload = this.parseTokenPayload(this.token);
      return payload.exp > Date.now() / 1000;
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
      const payload = parts[1];
      const decoded = atob(payload);
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
        id: payload.sub,
        accessCode: payload.accessCode,
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