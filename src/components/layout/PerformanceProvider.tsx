// Performance provider - lightweight wrapper
import { isProduction } from '@/utils/environment';

interface PerformanceProviderProps {
  children: React.ReactNode;
}

export const PerformanceProvider: React.FC<PerformanceProviderProps> = ({ children }) => {
  if (isProduction()) {
    return <>{children}</>;
  }

  return (
    <div data-testid="performance-provider">
      {children}
    </div>
  );
};