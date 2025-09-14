import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, X, Settings } from "lucide-react";

interface ProactivePromptProps {
  isOpen: boolean;
  question: string;
  context?: string;
  onRespond: (response: string) => void;
  onDismiss: () => void;
  onOptOut: () => void;
}

export const ProactivePrompt = ({ 
  isOpen, 
  question, 
  context,
  onRespond, 
  onDismiss, 
  onOptOut 
}: ProactivePromptProps) => {
  const [response, setResponse] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  const handleRespond = () => {
    if (response.trim()) {
      onRespond(response);
      setResponse("");
    }
  };

  const handleDismiss = () => {
    onDismiss();
    setResponse("");
  };

  const handleOptOut = () => {
    onOptOut();
    setResponse("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDismiss}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-yellow-500" />
            <DialogTitle>Conversation Prompt</DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
              className="ml-auto h-6 w-6 p-0"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <div className="space-y-4">
          {context && (
            <Badge variant="outline" className="text-xs">
              {context.replace('_', ' ')}
            </Badge>
          )}
          
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-900 leading-relaxed">
              {question}
            </p>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Your Response</label>
            <Textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder="Share your thoughts..."
              className="min-h-[100px]"
            />
          </div>
          
          {showSettings && (
            <div className="p-3 bg-gray-50 rounded-lg border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  Don't show proactive prompts anymore
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOptOut}
                  className="text-xs"
                >
                  Opt Out
                </Button>
              </div>
            </div>
          )}
          
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={handleDismiss}
              className="flex items-center gap-1"
            >
              <X className="h-3 w-3" />
              Maybe Later
            </Button>
            <Button
              onClick={handleRespond}
              disabled={!response.trim()}
              className="bg-democratic-blue hover:bg-democratic-blue/90"
            >
              Respond
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};