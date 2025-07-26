import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export const EmptyState = ({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) => {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center text-center p-8',
      className
    )}>
      {icon && (
        <div className="mb-4 rounded-full bg-muted p-4">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      {description && (
        <p className="text-muted-foreground mb-4 max-w-sm">
          {description}
        </p>
      )}
      {action}
    </div>
  );
};