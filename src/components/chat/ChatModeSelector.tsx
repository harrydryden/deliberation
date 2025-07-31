import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Settings, MessageCircle, GraduationCap } from "lucide-react";

export type ChatMode = 'chat' | 'learn';

interface ChatModeSelectorProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
}

export const ChatModeSelector = ({ mode, onModeChange }: ChatModeSelectorProps) => {
  const [open, setOpen] = useState(false);

  const handleModeSwitch = (checked: boolean) => {
    onModeChange(checked ? 'learn' : 'chat');
  };

  return (
    <>
      {/* Mode indicator badge */}
      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-muted text-muted-foreground text-sm">
        {mode === 'chat' ? (
          <>
            <MessageCircle className="h-4 w-4" />
            Chat Mode
          </>
        ) : (
          <>
            <GraduationCap className="h-4 w-4" />
            Learn Mode
          </>
        )}
      </div>

      {/* Settings trigger */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Settings className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Chat Mode Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" />
                  <span className="font-medium">Chat Mode</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  All agents participate in the conversation
                </p>
              </div>
              <Switch
                checked={mode === 'learn'}
                onCheckedChange={handleModeSwitch}
              />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-4 w-4" />
                  <span className="font-medium">Learn Mode</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Only the Bill Agent responds with educational content
                </p>
              </div>
            </div>
            
            <div className="p-3 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Current Mode: {mode === 'chat' ? 'Chat' : 'Learn'}</h4>
              <p className="text-sm text-muted-foreground">
                {mode === 'chat' 
                  ? 'Multiple agents will participate to provide diverse perspectives and facilitate discussion.'
                  : 'Only the Bill Agent will respond, focusing on educational explanations about the legislative content.'
                }
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};