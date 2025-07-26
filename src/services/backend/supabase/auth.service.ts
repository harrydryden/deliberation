import { supabase } from '@/integrations/supabase/client';
import { IAuthService } from '../base.service';
import { User } from '@/types/api';
import { AuthenticationError } from '@/utils/errors';

export class SupabaseAuthService implements IAuthService {
  private token: string | null = null;

  constructor() {
    this.initializeAuth();
  }

  private async initializeAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      this.token = session.access_token;
    }
  }

  async authenticate(accessCode: string): Promise<{ user: User; token: string }> {
    // Check if access code is valid
    const { data: accessCodeData, error: accessCodeError } = await supabase
      .from('access_codes')
      .select('*')
      .eq('code', accessCode)
      .eq('is_used', false)
      .single();

    if (accessCodeError || !accessCodeData) {
      throw new AuthenticationError('Invalid or already used access code');
    }

    // Sign up/in with access code as password
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: `${accessCode}@temp.local`,
      password: accessCode,
      options: {
        data: {
          access_code: accessCode,
        }
      }
    });

    if (authError) {
      // Try sign in if user already exists
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: `${accessCode}@temp.local`,
        password: accessCode,
      });

      if (signInError) {
        throw new AuthenticationError(signInError.message);
      }

      if (!signInData.user || !signInData.session) {
        throw new AuthenticationError('Authentication failed');
      }

      this.token = signInData.session.access_token;
      return {
        user: this.mapSupabaseUser(signInData.user, accessCode),
        token: signInData.session.access_token,
      };
    }

    if (!authData.user || !authData.session) {
      throw new AuthenticationError('Authentication failed');
    }

    // Mark access code as used
    await supabase
      .from('access_codes')
      .update({
        is_used: true,
        used_by: authData.user.id,
        used_at: new Date().toISOString(),
      })
      .eq('code', accessCode);

    this.token = authData.session.access_token;
    return {
      user: this.mapSupabaseUser(authData.user, accessCode),
      token: authData.session.access_token,
    };
  }

  async getCurrentUser(): Promise<User> {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      throw new AuthenticationError('No authenticated user');
    }

    const accessCode = user.user_metadata?.access_code || 'unknown';
    return this.mapSupabaseUser(user, accessCode);
  }

  async refreshToken(): Promise<{ user: User; token: string }> {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session || !data.user) {
      throw new AuthenticationError('Failed to refresh token');
    }

    this.token = data.session.access_token;
    const accessCode = data.user.user_metadata?.access_code || 'unknown';
    
    return {
      user: this.mapSupabaseUser(data.user, accessCode),
      token: data.session.access_token,
    };
  }

  async signOut(): Promise<void> {
    await supabase.auth.signOut();
    this.token = null;
  }

  getToken(): string | null {
    return this.token;
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  hasValidToken(): boolean {
    return !!this.token;
  }

  private mapSupabaseUser(supabaseUser: any, accessCode: string): User {
    return {
      id: supabaseUser.id,
      accessCode,
      profile: null, // Will be fetched separately if needed
    };
  }
}