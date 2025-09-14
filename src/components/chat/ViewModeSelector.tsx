import React, { memo } from "react";
import { MessageSquare, GitBranch, Table } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logger } from "@/utils/logger";
export type ViewMode = 'chat' | 'ibis' | 'table';
interface ViewModeSelectorProps {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
}
export const ViewModeSelector = memo(({
  mode,
  onModeChange
}: ViewModeSelectorProps) => {

  const modes = [
    { key: 'chat', label: 'Message', icon: MessageSquare },
    { key: 'ibis', label: 'Map', icon: GitBranch },
    { key: 'table', label: 'Table', icon: Table }
  ] as const;

  const handleModeClick = (modeKey: ViewMode) => {
    onModeChange(modeKey);
  };

  return (
    <div className="flex items-center gap-1 bg-muted rounded-lg p-1" aria-label="View mode">
      {modes.map(({ key, label, icon: Icon }) => (
        <Button
          key={key}
          variant={mode === key ? "default" : "ghost"}
          size="sm"
          onClick={() => handleModeClick(key)}
          className={`h-8 px-3 text-xs transition-all ${
            mode === key 
              ? 'bg-background text-foreground shadow-sm' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-label={`Switch to ${label} view`}
        >
          <Icon className="h-3 w-3 mr-1.5" />
          <span>{label}</span>
        </Button>
      ))}
    </div>
  );
});

ViewModeSelector.displayName = 'ViewModeSelector';