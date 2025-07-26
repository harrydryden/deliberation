import { IAuthService } from '../base.service';
import { User } from '@/types/api';
import { AuthenticationError } from '@/utils/errors';
import { BACKEND_CONFIG } from '@/config/backend';

export class NodeJSAuthService implements IAuthService {
  private token: string | null = null;

  constructor() {
    this.token = this.getStoredToken();
  }

  private getStoredToken(): string | null {
    try {
      return localStorage.getItem('auth_token');
    } catch {
      return null;
    }
  }

  async authenticate(accessCode: string): Promise<{ user: User; token: string }> {
    const response = await fetch(`${BACKEND_CONFIG.apiUrl}/api/v1/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ accessCode }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new AuthenticationError(error.message || 'Authentication failed');
    }

    const data = await response.json();
    this.setToken(data.token);
    
    return {
      user: data.user,
      token: data.token,
    };
  }

  async getCurrentUser(): Promise<User> {
    if (!this.token) {
      throw new AuthenticationError('No authentication token');
    }

    const response = await fetch(`${BACKEND_CONFIG.apiUrl}/api/v1/auth/me`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new AuthenticationError('Failed to get current user');
    }

    return response.json();
  }

  async refreshToken(): Promise<{ user: User; token: string }> {
    if (!this.token) {
      throw new AuthenticationError('No authentication token');
    }

    const response = await fetch(`${BACKEND_CONFIG.apiUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new AuthenticationError('Failed to refresh token');
    }

    const data = await response.json();
    this.setToken(data.token);
    
    return {
      user: data.user,
      token: data.token,
    };
  }

  async signOut(): Promise<void> {
    this.setToken(null);
  }

  getToken(): string | null {
    return this.token;
  }

  setToken(token: string | null): void {
    this.token = token;
    try {
      if (token) {
        localStorage.setItem('auth_token', token);
      } else {
        localStorage.removeItem('auth_token');
      }
    } catch (error) {
      console.warn('Failed to store token:', error);
    }
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
}