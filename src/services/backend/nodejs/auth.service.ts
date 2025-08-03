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
    // CRITICAL SECURITY NOTE: This method is INSECURE and should NEVER be used for authorization
    // Client-side JWT parsing cannot verify signatures and is vulnerable to tampering
    // This exists ONLY for UX optimization - all security decisions must happen server-side
    if (!this.token) return false;
    
    try {
      // Basic token format validation (no signature verification)
      const parts = this.token.split('.');
      if (parts.length !== 3) return false;
      
      // Parse payload WITHOUT signature verification (INSECURE)
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      
      // Simple expiry check with generous buffer for UX only
      const bufferTime = 60; // 60 seconds buffer
      return payload.exp && payload.exp > (Date.now() / 1000) + bufferTime;
    } catch {
      return false;
    }
  }
}