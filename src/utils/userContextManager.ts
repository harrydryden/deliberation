// DEPRECATED: This file is deprecated as of the header-based authentication implementation
// All functionality has been replaced by automatic header-based context setting in the Supabase client
// 
// Previous functionality:
// - User context management via PostgreSQL session variables
// - Manual context setting and caching
// - Complex race condition handling
//
// New approach:
// - Automatic header-based authentication via x-access-code header
// - RLS policies use get_authenticated_user() and is_authenticated_admin() functions
// - No manual context management needed
//
// Migration:
// - Replace userContextManager.getCurrentUser() with getCurrentUser() from @/integrations/supabase/client
// - Remove all ensureUserContext() calls - context is set automatically
// - No need for manual context setting anywhere in the application

console.warn('userContextManager is deprecated - using header-based authentication');

interface AccessCodeUser {
  id: string;
  accessCode: string;
  role: string;
}

// Legacy compatibility class (deprecated)
class UserContextManager {
  private static instance: UserContextManager;

  static getInstance(): UserContextManager {
    if (!UserContextManager.instance) {
      UserContextManager.instance = new UserContextManager();
    }
    return UserContextManager.instance;
  }

  getCurrentUser(): AccessCodeUser | null {
    console.warn('userContextManager.getCurrentUser is deprecated - use getCurrentUser from @/integrations/supabase/client');
    return null;
  }

  async ensureUserContext(userId?: string): Promise<boolean> {
    console.warn('userContextManager.ensureUserContext is deprecated - context is set automatically via headers');
    return true;
  }

  clearContextCache(userId?: string): void {
    console.warn('userContextManager.clearContextCache is deprecated - no caching needed with header-based auth');
  }

  async refreshContext(userId?: string): Promise<boolean> {
    console.warn('userContextManager.refreshContext is deprecated - context is set automatically via headers');
    return true;
  }
}

// Export singleton instance
export const userContextManager = UserContextManager.getInstance();

// Helper function for admin operations (deprecated)
export const ensureAdminContext = async (): Promise<boolean> => {
  console.warn('ensureAdminContext is deprecated - using header-based authentication');
  return true;
};

// Legacy compatibility functions (deprecated)
export const ensureUserContext = () => {
  console.warn('ensureUserContext is deprecated - using header-based authentication');
  return Promise.resolve(true);
};

export const getCurrentUser = () => {
  console.warn('getCurrentUser from userContextManager is deprecated - use getCurrentUser from @/integrations/supabase/client');
  return null;
};