import { Deliberation } from '@/types/index';

interface DeliberationStatsProps {
  deliberations: Deliberation[];
}

export const DeliberationStats = ({ deliberations }: DeliberationStatsProps) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="text-center">
        <div className="text-2xl font-bold">{deliberations.length}</div>
        <div className="text-sm text-muted-foreground">Total</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-green-600">
          {deliberations.filter(d => d.status === 'active').length}
        </div>
        <div className="text-sm text-muted-foreground">Active</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-blue-600">
          {deliberations.filter(d => d.status === 'draft').length}
        </div>
        <div className="text-sm text-muted-foreground">Draft</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-gray-600">
          {deliberations.filter(d => d.status === 'completed').length}
        </div>
        <div className="text-sm text-muted-foreground">Completed</div>
      </div>
    </div>
  );
};