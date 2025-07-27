import { supabase } from '@/integrations/supabase/client';
import { IAuthService } from '../base.service';
import { User } from '@/types/api';
import { AuthenticationError } from '@/utils/errors';

interface SessionData {
  user_id: string;
  access_code: string;
  expires_at: number;
}

export class SupabaseAuthService implements IAuthService {
  private token: string | null = null;
  private sessionKey = 'deliberation_session';

  constructor() {
    this.initializeAuth();
  }

  private async initializeAuth() {
    // Load session from localStorage instead of Supabase auth
    const storedSession = localStorage.getItem(this.sessionKey);
    if (storedSession) {
      try {
        const session: SessionData = JSON.parse(storedSession);
        if (session.expires_at > Date.now()) {
          this.token = session.user_id; // Use user_id as token
        } else {
          localStorage.removeItem(this.sessionKey);
        }
      } catch (error) {
        console.error('Failed to parse stored session:', error);
        localStorage.removeItem(this.sessionKey);
      }
    }
  }

  async authenticate(accessCode: string): Promise<{ user: User; token: string }> {
    console.log('🔐 Starting authentication with access code:', accessCode);
    
    // Validate access code exists
    const { data: accessCodeData, error: accessCodeError } = await supabase
      .from('access_codes')
      .select('*')
      .eq('code', accessCode)
      .single();

    console.log('📋 Access code check result:', { accessCodeData, accessCodeError });

    if (accessCodeError || !accessCodeData) {
      console.error('❌ Access code validation failed:', accessCodeError);
      throw new AuthenticationError('Invalid access code');
    }

    console.log('✅ Access code is valid, creating session...');

    // Generate a unique user ID for this session
    const userId = `user_${accessCode}_${Date.now()}`;
    
    // Create session data
    const sessionData: SessionData = {
      user_id: userId,
      access_code: accessCode,
      expires_at: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    };

    // Store session
    localStorage.setItem(this.sessionKey, JSON.stringify(sessionData));
    this.token = userId;

    // Get or create user profile
    let profile = null;
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!existingProfile) {
      // Create a profile for this session
      const { data: newProfile, error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          display_name: `User ${accessCode}`,
          user_role: accessCodeData.code_type === 'admin' ? 'admin' : 'user'
        })
        .select()
        .single();

      if (!profileError) {
        profile = newProfile;
      }
    } else {
      profile = existingProfile;
    }

    console.log('✅ Authentication successful!');

    const user: User = {
      id: userId,
      accessCode,
      profile
    };

    return { user, token: userId };
  }

  async getCurrentUser(): Promise<User> {
    console.log('🔍 Getting current user...');
    
    const storedSession = localStorage.getItem(this.sessionKey);
    if (!storedSession) {
      throw new AuthenticationError('No active session');
    }

    let session: SessionData;
    try {
      session = JSON.parse(storedSession);
    } catch (error) {
      throw new AuthenticationError('Invalid session data');
    }

    if (session.expires_at <= Date.now()) {
      localStorage.removeItem(this.sessionKey);
      throw new AuthenticationError('Session expired');
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user_id)
      .single();

    const user: User = {
      id: session.user_id,
      accessCode: session.access_code,
      profile
    };

    console.log('✅ User retrieved successfully:', user);
    return user;
  }

  async refreshToken(): Promise<{ user: User; token: string }> {
    // For this simple system, just validate current session and extend it
    const user = await this.getCurrentUser();
    
    // Extend session
    const sessionData: SessionData = {
      user_id: user.id,
      access_code: user.accessCode,
      expires_at: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    };
    
    localStorage.setItem(this.sessionKey, JSON.stringify(sessionData));
    
    return { user, token: user.id };
  }

  async signOut(): Promise<void> {
    localStorage.removeItem(this.sessionKey);
    this.token = null;
  }

  getToken(): string | null {
    return this.token;
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  hasValidToken(): boolean {
    if (!this.token) return false;
    
    const storedSession = localStorage.getItem(this.sessionKey);
    if (!storedSession) return false;
    
    try {
      const session: SessionData = JSON.parse(storedSession);
      return session.expires_at > Date.now();
    } catch {
      return false;
    }
  }
}