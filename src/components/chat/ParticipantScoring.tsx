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
    const percentage = score / target * 100;
    if (percentage >= 100) return 'bg-democratic-green text-white';
    if (percentage >= 70) return 'bg-civic-gold text-white';
    if (percentage >= 30) return 'bg-muted-foreground text-white';
    return 'bg-muted text-muted-foreground';
  };
  const scores = [{
    label: 'Engagement',
    value: engagement,
    icon: MessageSquare,
    description: 'Messages sent'
  }, {
    label: 'Shares',
    value: shares,
    icon: Share2,
    description: 'IBIS submissions'
  }, {
    label: 'Sessions',
    value: sessions,
    icon: Clock,
    description: 'Login sessions'
  }];
  return (
    <div className="flex flex-col gap-2 w-full p-3 bg-card border border-border rounded-lg">
      {scores.map(score => (
        <div key={score.label} className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <score.icon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <span className="text-xs font-medium text-foreground">{score.label}</span>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {score.value}/{target}
          </span>
        </div>
      ))}
    </div>
  );
};