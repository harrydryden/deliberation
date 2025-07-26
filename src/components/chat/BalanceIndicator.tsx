import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface BalanceIndicatorProps {
  supportive: number;
  counter: number;
  neutral: number;
  className?: string;
}

export const BalanceIndicator = ({ 
  supportive, 
  counter, 
  neutral, 
  className 
}: BalanceIndicatorProps) => {
  const total = supportive + counter + neutral;
  
  if (total === 0) {
    return (
      <Card className={`p-3 ${className}`}>
        <div className="text-center text-sm text-muted-foreground">
          No conversation data yet
        </div>
      </Card>
    );
  }

  const supportivePercent = (supportive / total) * 100;
  const counterPercent = (counter / total) * 100;
  const neutralPercent = (neutral / total) * 100;

  const getBalanceStatus = () => {
    const diff = Math.abs(supportivePercent - counterPercent);
    if (diff <= 10) return { status: 'balanced', color: 'text-green-600' };
    if (diff <= 25) return { status: 'slightly skewed', color: 'text-yellow-600' };
    return { status: 'heavily skewed', color: 'text-red-600' };
  };

  const { status, color } = getBalanceStatus();

  return (
    <Card className={`p-4 ${className}`}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-sm">Conversation Balance</h4>
          <Badge variant="outline" className={`text-xs ${color}`}>
            {status}
          </Badge>
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-3 w-3 text-green-600" />
            <span className="text-xs font-medium">Supportive</span>
            <div className="flex-1 mx-2">
              <Progress value={supportivePercent} className="h-2 bg-gray-100">
                <div 
                  className="h-full bg-green-500 transition-all" 
                  style={{ width: `${supportivePercent}%` }}
                />
              </Progress>
            </div>
            <span className="text-xs text-muted-foreground w-8 text-right">
              {Math.round(supportivePercent)}%
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <TrendingDown className="h-3 w-3 text-red-600" />
            <span className="text-xs font-medium">Counter</span>
            <div className="flex-1 mx-2">
              <Progress value={counterPercent} className="h-2 bg-gray-100">
                <div 
                  className="h-full bg-red-500 transition-all" 
                  style={{ width: `${counterPercent}%` }}
                />
              </Progress>
            </div>
            <span className="text-xs text-muted-foreground w-8 text-right">
              {Math.round(counterPercent)}%
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <Minus className="h-3 w-3 text-gray-600" />
            <span className="text-xs font-medium">Neutral</span>
            <div className="flex-1 mx-2">
              <Progress value={neutralPercent} className="h-2 bg-gray-100">
                <div 
                  className="h-full bg-gray-500 transition-all" 
                  style={{ width: `${neutralPercent}%` }}
                />
              </Progress>
            </div>
            <span className="text-xs text-muted-foreground w-8 text-right">
              {Math.round(neutralPercent)}%
            </span>
          </div>
        </div>
        
        <div className="text-xs text-muted-foreground text-center pt-1 border-t">
          Total responses: {total}
        </div>
      </div>
    </Card>
  );
};