import React, { memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { logger } from "@/utils/logger";

interface BalanceIndicatorProps {
  supportive: number;
  counter: number;
  neutral: number;
  className?: string;
}

export const BalanceIndicator = memo(({ 
  supportive, 
  counter, 
  neutral, 
  className 
}: BalanceIndicatorProps) => {

  // Memoize calculations
  const stats = useMemo(() => {
    const total = supportive + counter + neutral;
    if (total === 0) return null;
    
    const supportivePercent = Math.round((supportive / total) * 100);
    const counterPercent = Math.round((counter / total) * 100);
    const neutralPercent = Math.round((neutral / total) * 100);
    
    let trend: 'supportive' | 'counter' | 'balanced';
    let trendIcon: React.ReactNode;
    
    if (supportivePercent > counterPercent + 10) {
      trend = 'supportive';
      trendIcon = <TrendingUp className="h-4 w-4 text-green-600" />;
    } else if (counterPercent > supportivePercent + 10) {
      trend = 'counter'; 
      trendIcon = <TrendingDown className="h-4 w-4 text-red-600" />;
    } else {
      trend = 'balanced';
      trendIcon = <Minus className="h-4 w-4 text-blue-600" />;
    }
    
    return {
      total,
      supportivePercent,
      counterPercent, 
      neutralPercent,
      trend,
      trendIcon
    };
  }, [supportive, counter, neutral]);

  if (!stats) {
    return (
      <Card className={`p-3 ${className}`}>
        <div className="text-center text-muted-foreground text-sm">
          No participant positions recorded yet
        </div>
      </Card>
    );
  }

  const { supportivePercent, counterPercent, neutralPercent, trend, trendIcon } = stats;

  return (
    <Card className={`p-3 ${className}`}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Participant Balance</h3>
          <div className="flex items-center gap-1">
            {trendIcon}
            <span className="text-xs capitalize text-muted-foreground">
              {trend}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-green-600">Supportive {supportivePercent}%</span>
            <span className="text-red-600">Counter {counterPercent}%</span>
            <span className="text-blue-600">Neutral {neutralPercent}%</span>
          </div>

          <div className="flex h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="bg-green-500 transition-all duration-500" 
              style={{ width: `${supportivePercent}%` }}
            />
            <div 
              className="bg-red-500 transition-all duration-500" 
              style={{ width: `${counterPercent}%` }}
            />
            <div 
              className="bg-blue-500 transition-all duration-500" 
              style={{ width: `${neutralPercent}%` }}
            />
          </div>
        </div>

        <div className="flex justify-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="h-5 w-5 p-0 bg-green-500" />
            <span>{supportive}</span>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="h-5 w-5 p-0 bg-red-500" />
            <span>{counter}</span>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="h-5 w-5 p-0 bg-blue-500" />
            <span>{neutral}</span>
          </div>
        </div>
      </div>
    </Card>
  );
});

BalanceIndicator.displayName = 'BalanceIndicator';