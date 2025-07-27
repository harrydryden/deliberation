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
      .single();

    console.log('📋 Access code check result:', { accessCodeData, accessCodeError });

    if (accessCodeError || !accessCodeData) {
      console.error('❌ Access code validation failed:', accessCodeError);
      throw new AuthenticationError('Invalid access code');
    }

    console.log('✅ Access code is valid, proceeding with auth...');

    // Use access code as both email (hidden from user) and password  
    const email = `${accessCode}@deliberation.local`;
    console.log('🔑 Attempting sign up...');
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: accessCode,
      options: {
        data: {
          access_code: accessCode,
          code_type: accessCodeData.code_type
        }
      }
    });

    console.log('📝 Sign up result:', { authData, authError });

    if (authError) {
      console.log('🔄 Sign up failed, trying sign in...', authError.message);
      // Try sign in if user already exists
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
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
        user: this.mapSupabaseUser(signInData.user, accessCode, accessCodeData.code_type),
        token: signInData.session.access_token,
      };
    }

    if (!authData.user || !authData.session) {
      console.error('❌ Sign up succeeded but missing user/session');
      throw new AuthenticationError('Authentication failed');
    }

    console.log('✅ Sign up successful!');

    this.token = authData.session.access_token;
    return {
      user: this.mapSupabaseUser(authData.user, accessCode, accessCodeData.code_type),
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
    const codeType = user.user_metadata?.code_type || 'user';
    const mappedUser = this.mapSupabaseUser(user, accessCode, codeType);
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
    const codeType = data.user.user_metadata?.code_type || 'user';
    
    return {
      user: this.mapSupabaseUser(data.user, accessCode, codeType),
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

  private mapSupabaseUser(supabaseUser: any, accessCode: string, codeType: string): User {
    return {
      id: supabaseUser.id,
      accessCode,
      profile: {
        displayName: `User ${accessCode}`,
        expertiseAreas: [],
        avatarUrl: undefined,
        bio: undefined
      },
    };
  }
}