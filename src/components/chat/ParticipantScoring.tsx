import { MessageSquare, Share2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ParticipantScoringProps {
  engagement: number;
  shares: number;
  sessions: number;
  target?: number;
}

export const ParticipantScoring = ({ 
  engagement, 
  shares, 
  sessions, 
  target = 10 
}: ParticipantScoringProps) => {
  const getScoreColor = (score: number, target: number) => {
    const percentage = (score / target) * 100;
    if (percentage >= 100) return 'bg-democratic-green text-white';
    if (percentage >= 70) return 'bg-civic-gold text-white';
    if (percentage >= 30) return 'bg-muted-foreground text-white';
    return 'bg-muted text-muted-foreground';
  };

  const scores = [
    {
      label: 'Messages',
      value: engagement,
      icon: MessageSquare,
      description: 'Messages sent'
    },
    {
      label: 'Shares',
      value: shares,
      icon: Share2,
      description: 'IBIS submissions'
    },
    {
      label: 'Sessions',
      value: sessions,
      icon: Clock,
      description: 'Login sessions'
    }
  ];

  return (
    <div className="rounded-lg border bg-muted/40 p-3 h-full flex flex-col">
      <div className="flex flex-col gap-3 flex-1 justify-center">
        {scores.map((score) => (
          <div key={score.label} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <score.icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-medium text-foreground">{score.label}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground font-mono">
                {score.value}/{target}
              </span>
              <Badge 
                className={`text-xs px-2 py-1 min-w-[3rem] text-center ${getScoreColor(score.value, target)}`}
                variant="secondary"
              >
                {Math.round((score.value / target) * 100)}%
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};