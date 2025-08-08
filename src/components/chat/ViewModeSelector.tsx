import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MessageSquare, GitBranch, Columns3, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewMode = 'chat' | 'ibis' | 'split';

interface ViewModeSelectorProps {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
}

const modeConfig: Record<ViewMode, { label: string; Icon: React.ComponentType<any> }> = {
  chat: { label: 'Chat', Icon: MessageSquare },
  ibis: { label: 'IBIS', Icon: GitBranch },
  split: { label: 'Split', Icon: Columns3 },
};

export const ViewModeSelector = ({ mode, onModeChange }: ViewModeSelectorProps) => {
  const [open, setOpen] = useState(false);
  const { label, Icon } = modeConfig[mode];

  const handleSelect = (next: ViewMode) => {
    onModeChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="px-3 py-2 h-9 bg-muted/50 border rounded-lg">
          <span className="flex items-center gap-2 text-sm">
            <Icon className="h-4 w-4" />
            <span>{label}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="z-50 w-40 p-1 bg-popover border shadow-md">
        {(
          ["chat", "ibis", "split"] as ViewMode[]
        ).map((key) => {
          const { label, Icon } = modeConfig[key];
          const active = key === mode;
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleSelect(key)}
              className={cn(
                "w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-sm",
                active ? "bg-muted text-foreground" : "hover:bg-muted/60 text-muted-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
};
