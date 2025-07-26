import { useState, useEffect, createContext, useContext } from "react";
import { apiClient } from "@/lib/api-client";

interface User {
  id: string;
  email: string;
  displayName?: string;
}

interface BackendAuthContextType {
  user: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
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
      setUser({ id: 'user-id', email: 'user@example.com' }); // Placeholder
    }
    setIsLoading(false);
  }, []);

  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await apiClient.signIn(email, password);
      apiClient.setToken(response.token);
      setUser(response.user);
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    setIsLoading(true);
    try {
      const response = await apiClient.signUp(email, password, displayName);
      apiClient.setToken(response.token);
      setUser(response.user);
    } catch (error) {
      console.error('Sign up error:', error);
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
    signIn,
    signUp,
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