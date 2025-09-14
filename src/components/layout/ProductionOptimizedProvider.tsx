// Production-optimized provider
import React from 'react';
import { isProduction } from '@/utils/environment';

interface ProductionOptimizedProviderProps {
  children: React.ReactNode;
}

export const ProductionOptimizedProvider: React.FC<ProductionOptimizedProviderProps> = ({ children }) => {
  if (isProduction()) {
    return <>{children}</>;
  }
  
  return (
    <div data-testid="performance-provider">
      {children}
    </div>
  );
};