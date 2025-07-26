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
    console.log('🔐 Starting authentication with access code:', accessCode);
    
    // Check if access code is valid
    const { data: accessCodeData, error: accessCodeError } = await supabase
      .from('access_codes')
      .select('*')
      .eq('code', accessCode)
      .eq('is_used', false)
      .single();

    console.log('📋 Access code check result:', { accessCodeData, accessCodeError });

    if (accessCodeError || !accessCodeData) {
      console.error('❌ Access code validation failed:', accessCodeError);
      throw new AuthenticationError('Invalid or already used access code');
    }

    console.log('✅ Access code is valid, proceeding with auth...');

    // Sign up/in with access code as password
    console.log('🔑 Attempting sign up...');
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: `${accessCode}@temp.local`,
      password: accessCode,
      options: {
        data: {
          access_code: accessCode,
        }
      }
    });

    console.log('📝 Sign up result:', { authData, authError });

    if (authError) {
      console.log('🔄 Sign up failed, trying sign in...', authError.message);
      // Try sign in if user already exists
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: `${accessCode}@temp.local`,
        password: accessCode,
      });

      console.log('🔓 Sign in result:', { signInData, signInError });
      if (signInError) {
        console.error('❌ Sign in failed:', signInError);
        throw new AuthenticationError(signInError.message);
      }

      if (!signInData.user || !signInData.session) {
        console.error('❌ Sign in succeeded but missing user/session');
        throw new AuthenticationError('Authentication failed');
      }

      console.log('✅ Sign in successful!');
      this.token = signInData.session.access_token;
      return {
        user: this.mapSupabaseUser(signInData.user, accessCode),
        token: signInData.session.access_token,
      };
    }

    if (!authData.user || !authData.session) {
      console.error('❌ Sign up succeeded but missing user/session');
      throw new AuthenticationError('Authentication failed');
    }

    console.log('✅ Sign up successful!');

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
    console.log('🔍 Getting current user...');
    const { data: { user }, error } = await supabase.auth.getUser();
    console.log('🔍 Supabase getUser result:', { user, error });
    
    if (error || !user) {
      console.error('❌ getCurrentUser failed:', error);
      throw new AuthenticationError('No authenticated user');
    }

    const accessCode = user.user_metadata?.access_code || 'unknown';
    const mappedUser = this.mapSupabaseUser(user, accessCode);
    console.log('✅ User mapped successfully:', mappedUser);
    return mappedUser;
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