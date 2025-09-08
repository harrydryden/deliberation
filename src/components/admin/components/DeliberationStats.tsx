import { Deliberation } from '@/types/index';

interface DeliberationStatsProps {
  deliberations: Deliberation[];
}

export const DeliberationStats = ({ deliberations }: DeliberationStatsProps) => {
  // Add null check to prevent runtime errors
  const safeDeliberations = deliberations || [];
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="text-center">
        <div className="text-2xl font-bold">{safeDeliberations.length}</div>
        <div className="text-sm text-muted-foreground">Total</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-green-600">
          {safeDeliberations.filter(d => d.status === 'active').length}
        </div>
        <div className="text-sm text-muted-foreground">Active</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-blue-600">
          {safeDeliberations.filter(d => d.status === 'draft').length}
        </div>
        <div className="text-sm text-muted-foreground">Draft</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-gray-600">
          {safeDeliberations.filter(d => d.status === 'concluded').length}
        </div>
        <div className="text-sm text-muted-foreground">Completed</div>
      </div>
    </div>
  );
};