import { supabase } from '@/integrations/supabase/client';
import { IAuthService } from '../base.service';
import { User } from '@/types/api';
import { AuthenticationError } from '@/utils/errors';
import { userCache } from '@/utils/validation';

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
    
    // Use secure validation function instead of direct table access
    const { data: validationResult, error: validationError } = await supabase.rpc(
      'validate_access_code_secure', 
      { input_code: accessCode }
    );

    console.log('📋 Access code validation result:', { validationResult, validationError });

    if (validationError || !validationResult?.valid) {
      console.error('❌ Access code validation failed:', validationError || validationResult);
      const reason = validationResult?.reason || 'invalid_code';
      throw new AuthenticationError(`Invalid access code: ${reason}`);
    }

    console.log('✅ Access code is valid, proceeding with auth...');

    // Extract code type from validation result
    const codeType = validationResult.code_type;

    // Use access code as both email (hidden from user) and password  
    const email = `${accessCode}@deliberation.local`;
    console.log('🔑 Attempting sign up...');
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: accessCode,
      options: {
        data: {
          access_code: accessCode,
          code_type: codeType,
          user_role: codeType === 'admin' ? 'admin' : 'user'
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
      
      // Get user profile including role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, display_name, expertise_areas')
        .eq('id', signInData.user.id)
        .single();
      
      return {
        user: this.mapSupabaseUser(signInData.user, accessCode, codeType, profile),
        token: signInData.session.access_token,
      };
    }

    if (!authData.user || !authData.session) {
      console.error('❌ Sign up succeeded but missing user/session');
      throw new AuthenticationError('Authentication failed');
    }

    console.log('✅ Sign up successful!');

    this.token = authData.session.access_token;
    
    // Get user profile including role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, display_name, expertise_areas')
      .eq('id', authData.user.id)
      .single();
    
    return {
      user: this.mapSupabaseUser(authData.user, accessCode, codeType, profile),
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

    // Clear cache to ensure fresh role data
    userCache.clear(user.id);
    console.log('🗑️ Cleared user cache to refresh role data');

    // Batch query for better performance - get user profile in single request
    const { data: profile } = await supabase
      .from('user_cache')  // Use optimized view
      .select('*')
      .eq('id', user.id)
      .single();

    console.log('🔍 Profile data from user_cache:', profile);

    const accessCode = user.user_metadata?.access_code || 'unknown';
    const codeType = user.user_metadata?.code_type || 'user';
    const mappedUser = this.mapSupabaseUser(user, accessCode, codeType, profile);
    
    // Cache for future requests (5 minute TTL)
    userCache.set(user.id, mappedUser);
    
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
    
    // Get user profile including role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, display_name, expertise_areas')
      .eq('id', data.user.id)
      .single();
    
    return {
      user: this.mapSupabaseUser(data.user, accessCode, codeType, profile),
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
    // SECURITY: For Supabase, rely on session management
    // Token validity is handled by Supabase internally
    return !!this.token;
  }

  private mapSupabaseUser(supabaseUser: any, accessCode: string, codeType: string, profile?: any): User {
    return {
      id: supabaseUser.id,
      accessCode,
      role: profile?.user_role || profile?.role || 'user',
      profile: {
        displayName: profile?.display_name || `User ${accessCode}`,
        expertiseAreas: profile?.expertise_areas || [],
        avatarUrl: undefined,
        bio: undefined
      },
    };
  }
}