import React, { createContext, useContext, ReactNode } from 'react';
import { useOptimizedAuth } from '@/hooks/useOptimizedAuth';

// Create context for optimized auth
const OptimizedAuthContext = createContext<ReturnType<typeof useOptimizedAuth> | undefined>(undefined);

export const OptimizedAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const authState = useOptimizedAuth();
  
  return (
    <OptimizedAuthContext.Provider value={authState}>
      {children}
    </OptimizedAuthContext.Provider>
  );
};

export const useOptimizedAuthContext = () => {
  const context = useContext(OptimizedAuthContext);
  if (context === undefined) {
    throw new Error('useOptimizedAuthContext must be used within an OptimizedAuthProvider');
  }
  return context;
};