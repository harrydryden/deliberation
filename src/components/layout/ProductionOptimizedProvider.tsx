// Production-optimized provider that replaces heavy performance monitoring
import React from 'react';
import { isProduction } from '@/utils/productionConfig';

interface ProductionOptimizedProviderProps {
  children: React.ReactNode;
}

export const ProductionOptimizedProvider: React.FC<ProductionOptimizedProviderProps> = ({ children }) => {
  // In production, just render children without any performance monitoring
  if (isProduction) {
    return <>{children}</>;
  }
  
  // In development, we can still have very light monitoring
  return (
    <div data-testid="performance-provider">
      {children}
    </div>
  );
};