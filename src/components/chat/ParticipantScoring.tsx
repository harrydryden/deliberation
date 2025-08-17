import { MessageSquare, Share2, Clock, Star, ThumbsUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ParticipantScoringProps {
  engagement: number;
  shares: number;
  sessions: number;
  helpfulness: number;
}
export const ParticipantScoring = ({
  engagement,
  shares,
  sessions,
  helpfulness,
}: ParticipantScoringProps) => {
  // Convert raw values to star ratings (1-5)
  const calculateStars = (value: number, threshold: number): number => {
    return Math.min(5, Math.floor(value / threshold));
  };

  const renderStars = (filledStars: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-3 w-3 ${
          i < filledStars 
            ? 'fill-civic-gold text-civic-gold' 
            : 'text-muted-foreground'
        }`}
      />
    ));
  };

  const renderThumbs = (filledThumbs: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <ThumbsUp
        key={i}
        className={`h-3 w-3 ${
          i < filledThumbs 
            ? 'fill-civic-blue text-civic-blue' 
            : 'text-muted-foreground'
        }`}
      />
    ));
  };

  const scores = [{
    label: 'Engaging',
    rawValue: engagement,
    stars: calculateStars(engagement, 10),
    icon: MessageSquare,
    description: `${engagement} messages`,
    renderMethod: 'stars'
  }, {
    label: 'Shares',
    rawValue: shares,
    stars: calculateStars(shares, 5),
    icon: Share2,
    description: `${shares} IBIS contributions`,
    renderMethod: 'stars'
  }, {
    label: 'Sessions',
    rawValue: sessions,
    stars: calculateStars(sessions, 2),
    icon: Clock,
    description: `${sessions} login sessions`,
    renderMethod: 'stars'
  }, {
    label: 'Helping',
    rawValue: helpfulness,
    stars: Math.min(5, helpfulness), // Direct mapping for thumbs up (max 5)
    icon: ThumbsUp,
    description: `${helpfulness} net positive contribution${helpfulness !== 1 ? 's' : ''}`,
    renderMethod: 'thumbs'
  }];

  return (
    <div className="flex flex-col gap-2 w-full">
      {scores.map(score => (
        <div key={score.label} className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <score.icon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <span className="text-xs font-medium text-foreground">{score.label}</span>
          </div>
          <div className="flex items-center gap-1">
            {score.renderMethod === 'thumbs' ? renderThumbs(score.stars) : renderStars(score.stars)}
          </div>
        </div>
      ))}
    </div>
  );
};