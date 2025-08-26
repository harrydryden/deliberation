import { MessageSquare, Share2, Clock, Star, ThumbsUp, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface ParticipantScoringProps {
  engagement: number;
  shares: number;
  sessions: number;
  helpfulness: number;
  stanceScore?: number; // -1.0 to 1.0 (negative to positive stance)
}
export const ParticipantScoring = ({
  engagement,
  shares,
  sessions,
  helpfulness,
  stanceScore,
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
    description: 'How active you are in discussions',
    tooltip: `${engagement} messages sent in this deliberation`,
    renderMethod: 'stars',
    customIconColor: undefined
  }, {
    label: 'Shares',
    rawValue: shares,
    stars: calculateStars(shares, 5),
    icon: Share2,
    description: 'Your contributions to the knowledge map',
    tooltip: `${shares} IBIS node${shares !== 1 ? 's' : ''} shared`,
    renderMethod: 'stars',
    customIconColor: undefined
  }, {
    label: 'Sessions',
    rawValue: sessions,
    stars: calculateStars(sessions, 2),
    icon: Clock,
    description: 'How often you participate',
    tooltip: `${sessions} login session${sessions !== 1 ? 's' : ''} recorded`,
    renderMethod: 'stars',
    customIconColor: undefined
  }, {
    label: 'Helping',
    rawValue: helpfulness,
    stars: Math.min(5, helpfulness), // Direct mapping for thumbs up (max 5)
    icon: ThumbsUp,
    description: 'Quality of your contributions rated by others',
    tooltip: `${helpfulness} net positive rating${helpfulness !== 1 ? 's' : ''} received`,
    renderMethod: 'thumbs',
    customIconColor: undefined
  }];

  // Always add stance score (default to 0/neutral if not provided)
  const displayStanceScore = stanceScore !== undefined ? stanceScore : 0;

  const getStanceTooltip = () => {
    if (stanceScore === undefined) {
      return 'Notion: Neutral (No IBIS submissions yet)';
    }
    return `Notion: ${displayStanceScore >= 0.3 ? 'Supporting' : displayStanceScore <= -0.3 ? 'Opposing' : 'Neutral'} (${displayStanceScore >= 0 ? '+' : ''}${displayStanceScore.toFixed(2)})`;
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
    description: 'Your notion towards the deliberation topic based on IBIS submissions',
    tooltip: getStanceTooltip(),
    renderMethod: 'stance',
    customIconColor: undefined
  });

  return (
    <div className="flex flex-col gap-2 w-full">
      {scores.map(score => (
        <div key={score.label} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <score.icon className={`h-3 w-3 flex-shrink-0 ${score.customIconColor || 'text-muted-foreground'}`} />
            <Popover>
              <PopoverTrigger asChild>
                <span className="text-xs font-medium text-foreground cursor-help hover:text-primary">{score.label}</span>
              </PopoverTrigger>
              <PopoverContent side="top" className="w-auto p-2 text-xs">
                <div>
                  <p className="font-medium">{score.description}</p>
                  <p className="text-muted-foreground">{score.tooltip}</p>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-center gap-1">
            {score.renderMethod === 'thumbs' ? renderThumbs(score.stars) : 
             score.renderMethod === 'stance' ? renderStanceLine() :
             renderStars(score.stars)}
          </div>
        </div>
      ))}
    </div>
  );
};