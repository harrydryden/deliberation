// View mode toggle switch (Chat | IBIS), styled like ChatModeSelector
import { MessageSquare, GitBranch } from "lucide-react";
import { Switch } from "@/components/ui/switch";
export type ViewMode = 'chat' | 'ibis';
interface ViewModeSelectorProps {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
}
export const ViewModeSelector = ({
  mode,
  onModeChange
}: ViewModeSelectorProps) => {
  const handleSwitch = (checked: boolean) => {
    onModeChange(checked ? 'ibis' : 'chat');
  };
  const containerCls = 'flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/50 border';
  const chatLabelCls = 'flex items-center gap-2 text-sm transition-colors ' + (mode === 'chat' ? 'text-foreground font-medium' : 'text-muted-foreground');
  const ibisLabelCls = 'flex items-center gap-2 text-sm transition-colors ' + (mode === 'ibis' ? 'text-foreground font-medium' : 'text-muted-foreground');
  return <div className={containerCls} aria-label="View mode">
      {/* Chat label */}
      <div className={chatLabelCls}>
        <MessageSquare className="h-4 w-4" />
        <span>Message</span>
      </div>

      {/* Switch */}
      <Switch checked={mode === 'ibis'} onCheckedChange={handleSwitch} className="data-[state=checked]:bg-primary" aria-label="Toggle view mode between Chat and IBIS" />

      {/* IBIS label */}
      <div className={ibisLabelCls}>
        <GitBranch className="h-4 w-4" />
        <span>Map</span>
      </div>
    </div>;
};