// Lightweight performance provider for production
import { logger } from '@/utils/logger';

interface PerformanceProviderProps {
  children: React.ReactNode;
}

export const PerformanceProvider: React.FC<PerformanceProviderProps> = ({ children }) => {
  // In production, just render children without any heavy monitoring
  if (process.env.NODE_ENV === 'production') {
    return <>{children}</>;
  }

  // Light development monitoring only
  return (
    <div data-testid="performance-provider">
      {children}
    </div>
  );
};