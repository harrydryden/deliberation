// View mode toggle switch (Chat | IBIS), styled like ChatModeSelector
import React, { memo } from "react";
import { MessageSquare, GitBranch } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { performanceMonitor } from "@/utils/performanceMonitor";
export type ViewMode = 'chat' | 'ibis';
interface ViewModeSelectorProps {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
}
export const ViewModeSelector = memo(({
  mode,
  onModeChange
}: ViewModeSelectorProps) => {
  // Performance tracking
  const startTime = performance.now();
  React.useEffect(() => {
    performanceMonitor.trackRender('ViewModeSelector', startTime);
  });

  const handleSwitch = (checked: boolean) => {
    onModeChange(checked ? 'ibis' : 'chat');
  };
  const containerCls = 'flex items-center gap-3';
  const chatLabelCls = 'flex items-center gap-2 text-sm transition-colors w-28 justify-end ' + (mode === 'chat' ? 'text-foreground font-medium' : 'text-muted-foreground');
  const ibisLabelCls = 'flex items-center gap-2 text-sm transition-colors w-28 ' + (mode === 'ibis' ? 'text-foreground font-medium' : 'text-muted-foreground');
  return <div className={containerCls} aria-label="View mode">
      {/* Chat label */}
      <div className={chatLabelCls}>
        <MessageSquare className="h-4 w-4" />
        <span>Message</span>
      </div>

      {/* Switch */}
      <Switch checked={mode === 'ibis'} onCheckedChange={handleSwitch} className="self-center data-[state=checked]:bg-primary" aria-label="Toggle view mode between Chat and IBIS" />

      {/* IBIS label */}
      <div className={ibisLabelCls}>
        <GitBranch className="h-4 w-4" />
        <span>Map</span>
      </div>
    </div>;
});

ViewModeSelector.displayName = 'ViewModeSelector';