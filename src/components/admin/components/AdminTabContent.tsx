import { ReactNode } from 'react';
import { TabsContent } from '@/components/ui/tabs';
import { AdminErrorBoundary } from '@/components/error-boundaries/AdminErrorBoundary';

interface AdminTabContentProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export const AdminTabContent = ({ 
  value, 
  children, 
  className = "space-y-4" 
}: AdminTabContentProps) => {
  return (
    <TabsContent value={value} className={className}>
      <AdminErrorBoundary>
        {children}
      </AdminErrorBoundary>
    </TabsContent>
  );
};