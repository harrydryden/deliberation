import React, { memo } from "react";
import { Switch } from "@/components/ui/switch";
import { MessageCircle, GraduationCap } from "lucide-react";
import { logger } from "@/utils/logger";
export type ChatMode = 'chat' | 'learn';
interface ChatModeSelectorProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  variant?: 'boxed' | 'bare';
}
export const ChatModeSelector = memo(({
  mode,
  onModeChange,
  variant = 'boxed'
}: ChatModeSelectorProps) => {

  const handleModeSwitch = (checked: boolean) => {
    onModeChange(checked ? 'learn' : 'chat');
  };
  const containerCls = variant === 'boxed' ? 'flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/50 border' : 'flex items-center gap-3';
  const chatLabelCls = 'flex items-center gap-2 text-sm transition-colors w-28 justify-end ' + (mode === 'chat' ? 'text-foreground font-medium' : 'text-muted-foreground');
  const learnLabelCls = 'flex items-center gap-2 text-sm transition-colors w-28 ' + (mode === 'learn' ? 'text-foreground font-medium' : 'text-muted-foreground');
  return <div className={containerCls}>
      {/* Chat Mode Label */}
      <div className={chatLabelCls}>
        <MessageCircle className="h-4 w-4" />
        <span>Deliberate</span>
      </div>

      {/* Switch */}
      <Switch checked={mode === 'learn'} onCheckedChange={handleModeSwitch} className="data-[state=checked]:bg-primary" aria-label="Toggle text mode between Deliberate and Ask an Expert" />

      {/* Learn Mode Label */}
      <div className={learnLabelCls}>
        <GraduationCap className="h-4 w-4" />
        <span>Policy Q&A</span>
      </div>
    </div>;
});

ChatModeSelector.displayName = 'ChatModeSelector';