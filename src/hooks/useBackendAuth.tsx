import { useState, useEffect, createContext, useContext } from "react";
import { apiClient } from "@/lib/api-client";
import { User } from "@/types/api";
import { AuthContextType } from "@/types/auth";
import { authService } from "@/services/auth.service";
import { getErrorMessage, AuthenticationError } from "@/utils/errors";

const BackendAuthContext = createContext<AuthContextType | undefined>(undefined);

export const BackendAuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    setIsLoading(true);
    try {
      // Check if we have a valid token
      if (authService.hasValidToken()) {
        // Try to get current user from backend
        try {
          const currentUser = await apiClient.getCurrentUser();
          setUser(currentUser);
        } catch (error) {
          // Token might be invalid or expired
          console.warn('Failed to get current user:', getErrorMessage(error));
          authService.clearAuth();
          throw new AuthenticationError('Invalid or expired token');
        }
      }
    } catch (error) {
      console.error('Auth initialization error:', getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const authenticate = async (accessCode: string): Promise<void> => {
    setIsLoading(true);
    try {
      const response = await apiClient.authenticate(accessCode);
      authService.setToken(response.token);
      setUser(response.user);
    } catch (error) {
      console.error('Authentication error:', getErrorMessage(error));
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await apiClient.signOut();
    } catch (error) {
      console.error('Sign out error:', getErrorMessage(error));
    } finally {
      setUser(null);
      setIsLoading(false);
    }
  };

  const refreshToken = async (): Promise<void> => {
    try {
      const response = await apiClient.refreshToken();
      authService.setToken(response.token);
    } catch (error) {
      console.error('Token refresh error:', getErrorMessage(error));
      // If refresh fails, clear auth and redirect to login
      authService.clearAuth();
      setUser(null);
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    authenticate,
    signOut,
    refreshToken,
    isAuthenticated: !!user,
  };

  return (
    <BackendAuthContext.Provider value={value}>
      {children}
    </BackendAuthContext.Provider>
  );
};

export const useBackendAuth = () => {
  const context = useContext(BackendAuthContext);
  if (context === undefined) {
    throw new Error("useBackendAuth must be used within a BackendAuthProvider");
  }
  return context;
};