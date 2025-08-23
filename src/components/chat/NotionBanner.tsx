import { Card } from '@/components/ui/card';
import { Target } from 'lucide-react';

interface NotionBannerProps {
  notion: string;
  className?: string;
}

export const NotionBanner = ({ notion, className = "" }: NotionBannerProps) => {
  if (!notion) return null;

  return (
    <Card className={`bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20 ${className}`}>
      <div className="p-3 flex items-center gap-3">
        <div className="shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
          <Target className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-primary/80 uppercase tracking-wide">
            Deliberation Focus
          </div>
          <div className="text-sm font-semibold text-foreground mt-1">
            {notion}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Your messages will be analyzed for positions on this statement
          </div>
        </div>
      </div>
    </Card>
  );
};