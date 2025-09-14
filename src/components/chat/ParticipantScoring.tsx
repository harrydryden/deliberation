import { MessageSquare, Share2, Clock, Star, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface ParticipantScoringProps {
  engagement: number;
  shares: number;
  sessions: number;
  stanceScore?: number; // -1.0 to 1.0 (negative to positive stance)
}
export const ParticipantScoring = ({
  engagement,
  shares,
  sessions,
  stanceScore,
}: ParticipantScoringProps) => {
  // Convert raw values to star ratings (1-5) with more achievable thresholds
  const calculateStars = (value: number, threshold: number): number => {
    return Math.min(5, Math.max(1, Math.ceil(value / threshold)));
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

  const scores = [{
    label: 'Engaging',
    rawValue: engagement,
    stars: calculateStars(engagement, 3), // More achievable: 3 messages per star
    icon: MessageSquare,
    description: 'How active you are in discussions',
    tooltip: `${engagement} messages sent (${calculateStars(engagement, 3)}/5 stars)`,
    renderMethod: 'stars',
    customIconColor: undefined
  }, {
    label: 'Shares',
    rawValue: shares,
    stars: calculateStars(shares, 2), // More achievable: 2 shares per star
    icon: Share2,
    description: 'Your contributions to the knowledge map',
    tooltip: `${shares} IBIS node${shares !== 1 ? 's' : ''} shared (${calculateStars(shares, 2)}/5 stars)`,
    renderMethod: 'stars',
    customIconColor: undefined
  }, {
    label: 'Sessions',
    rawValue: sessions,
    stars: calculateStars(sessions, 1), // More achievable: 1 session per star
    icon: Clock,
    description: 'How often you participate',
    tooltip: `${sessions} login session${sessions !== 1 ? 's' : ''} (${calculateStars(sessions, 1)}/5 stars)`,
    renderMethod: 'stars',
    customIconColor: undefined
  }];

  // Always add stance score (default to 0/neutral if not provided)
  const displayStanceScore = stanceScore !== undefined ? stanceScore : 0;

  const getStanceTooltip = () => {
    if (stanceScore === undefined) {
      return 'Notion: Neutral (No IBIS submissions yet, calculated from message analysis)';
    }
    const stanceLabel = displayStanceScore >= 0.3 ? 'Supporting' : displayStanceScore <= -0.3 ? 'Opposing' : 'Neutral';
    return `Notion: ${stanceLabel} (${displayStanceScore >= 0 ? '+' : ''}${displayStanceScore.toFixed(2)}, AI-analyzed from your messages)`;
  };

  const renderStanceLine = () => {
    // Convert -1 to 1 range to 0-100% position
    const position = ((displayStanceScore + 1) / 2) * 100;
    
    return (
      <div className="relative w-20 h-4 flex items-center">
        {/* Horizontal line */}
        <div className="absolute w-full h-0.5 bg-border"></div>
        {/* Center mark */}
        <div className="absolute left-1/2 transform -translate-x-0.5 w-0.5 h-4 bg-muted-foreground"></div>
        {/* Position indicator */}
        <div 
          className="absolute w-2 h-2 rounded-full bg-primary transform -translate-x-1"
          style={{ left: `${Math.max(4, Math.min(96, position))}%` }}
        ></div>
        {/* Labels */}
        <span className="absolute -left-1 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">No</span>
        <span className="absolute -right-1 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">Yes</span>
      </div>
    );
  };

  scores.push({
    label: 'Notion',
    rawValue: displayStanceScore,
    stars: 0, // Not used for stance
    icon: Minus,
    description: 'Your position on the notion',
    tooltip: getStanceTooltip(),
    renderMethod: 'stance',
    customIconColor: undefined
  });

  return (
    <div className="flex flex-col gap-2 w-full">
      {scores.map(score => (
        <div key={score.label} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-1">
            <score.icon className={`h-3 w-3 flex-shrink-0 ${score.customIconColor || 'text-muted-foreground'}`} />
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 min-w-0 flex-1">
              <Popover>
                <PopoverTrigger asChild>
                  <span className="text-xs font-medium text-foreground cursor-help hover:text-primary whitespace-nowrap">{score.label}</span>
                </PopoverTrigger>
                <PopoverContent side="top" className="w-auto p-2 text-xs">
                  <div>
                    <p className="font-medium">{score.description}</p>
                    <p className="text-muted-foreground">{score.tooltip}</p>
                  </div>
                </PopoverContent>
              </Popover>
              <span className="hidden sm:inline text-xs text-muted-foreground truncate">{score.description}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {score.renderMethod === 'stance' ? renderStanceLine() : renderStars(score.stars)}
          </div>
        </div>
      ))}
    </div>
  );
};