import { useState, useEffect, createContext, useContext } from "react";
import { apiClient } from "@/lib/api-client";

interface User {
  id: string;
  accessCode: string;
  displayName?: string;
}

interface BackendAuthContextType {
  user: User | null;
  isLoading: boolean;
  authenticate: (accessCode: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
}

const BackendAuthContext = createContext<BackendAuthContextType | undefined>(undefined);

export const BackendAuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing token on mount
    const token = localStorage.getItem('auth_token');
    if (token) {
      apiClient.setToken(token);
      // In a real app, you'd validate the token with the backend
      // For now, we'll assume it's valid if it exists
      setUser({ id: 'user-id', accessCode: '1234567890' }); // Placeholder
    }
    setIsLoading(false);
  }, []);

  const authenticate = async (accessCode: string, displayName?: string) => {
    setIsLoading(true);
    try {
      const response = await apiClient.authenticate(accessCode, displayName);
      apiClient.setToken(response.token);
      setUser(response.user);
    } catch (error) {
      console.error('Authentication error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    setIsLoading(true);
    try {
      await apiClient.signOut();
      setUser(null);
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const value = {
    user,
    isLoading,
    authenticate,
    signOut,
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