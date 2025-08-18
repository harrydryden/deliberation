// DEPRECATED: This file is deprecated as of the header-based authentication implementation
// All functionality has been replaced by automatic header-based context setting in the Supabase client
//
// Previous functionality:
// - Manual user context setting via PostgreSQL session variables
// - User retrieval from localStorage
//
// New approach:
// - Use getCurrentUser() from @/integrations/supabase/client
// - Automatic header-based authentication
//
// Migration:
// - Replace getCurrentUser() calls with imports from @/integrations/supabase/client
// - Remove setUserContext() and ensureUserContext() calls

console.warn('authHelpers is deprecated - using header-based authentication');

interface AccessCodeUser {
  id: string;
  accessCode?: string;
  role?: string;
}

export const getCurrentUser = (): AccessCodeUser | null => {
  console.warn('getCurrentUser from authHelpers is deprecated - use getCurrentUser from @/integrations/supabase/client');
  
  if (typeof localStorage === 'undefined') return null;
  
  try {
    const storedUser = localStorage.getItem('simple_auth_user');
    if (!storedUser) return null;
    
    const user = JSON.parse(storedUser);
    if (!user || typeof user !== 'object') return null;
    
    return {
      id: user.id,
      accessCode: user.accessCode,
      role: user.role
    };
  } catch (error) {
    console.warn('Error parsing stored user:', error);
    return null;
  }
};

export const setUserContext = async (): Promise<boolean> => {
  console.warn('setUserContext is deprecated - using header-based authentication');
  return true;
};

export const ensureUserContext = async (): Promise<AccessCodeUser | null> => {
  console.warn('ensureUserContext is deprecated - using header-based authentication');
  return getCurrentUser();
};