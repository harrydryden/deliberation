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
    // TODO: Implement token blacklisting on the server
    // Currently only clearing client-side token
    const token = this.getToken();
    
    if (token) {
      // Attempt to invalidate token on server (if endpoint exists)
      try {
        await fetch(`${BACKEND_CONFIG.apiUrl}/api/v1/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      } catch (error) {
        // Continue with client-side logout even if server logout fails
        console.warn('Server logout failed:', error);
      }
    }
    
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
}