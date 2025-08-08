import { Switch } from "@/components/ui/switch";
import { MessageCircle, GraduationCap } from "lucide-react";

export type ChatMode = 'chat' | 'learn';

interface ChatModeSelectorProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  variant?: 'boxed' | 'bare';
}

export const ChatModeSelector = ({ mode, onModeChange, variant = 'boxed' }: ChatModeSelectorProps) => {
  const handleModeSwitch = (checked: boolean) => {
    onModeChange(checked ? 'learn' : 'chat');
  };

  return (
    <div className={variant === 'boxed' ? "flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/50 border" : "flex items-center gap-3">
      {/* Chat Mode Label */}
      <div className={`flex items-center gap-2 text-sm transition-colors ${
        mode === 'chat' ? 'text-foreground font-medium' : 'text-muted-foreground'
      }`}>
        <MessageCircle className="h-4 w-4" />
        <span>Deliberate</span>
      </div>

      {/* Switch */}
      <Switch
        checked={mode === 'learn'}
        onCheckedChange={handleModeSwitch}
        className="data-[state=checked]:bg-primary"
      />

      {/* Learn Mode Label */}
      <div className={`flex items-center gap-2 text-sm transition-colors ${
        mode === 'learn' ? 'text-foreground font-medium' : 'text-muted-foreground'
      }`}>
        <GraduationCap className="h-4 w-4" />
        <span>Ask an Expert</span>
      </div>
    </div>
  );
};