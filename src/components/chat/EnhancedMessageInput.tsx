import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Send, HelpCircle, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface EnhancedMessageInputProps {
  onSendMessage: (message: string, type: 'QUESTION' | 'STATEMENT' | 'OTHER') => void;
  disabled?: boolean;
}

export const EnhancedMessageInput = ({ onSendMessage, disabled }: EnhancedMessageInputProps) => {
  const [message, setMessage] = useState("");
  const [inputType, setInputType] = useState<'QUESTION' | 'STATEMENT' | 'OTHER'>('OTHER');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const detectInputType = (text: string): 'QUESTION' | 'STATEMENT' | 'OTHER' => {
    const trimmed = text.trim();
    if (trimmed.endsWith('?') || trimmed.toLowerCase().startsWith('what') || 
        trimmed.toLowerCase().startsWith('how') || trimmed.toLowerCase().startsWith('why') ||
        trimmed.toLowerCase().startsWith('when') || trimmed.toLowerCase().startsWith('where')) {
      return 'QUESTION';
    }
    if (trimmed.length > 10) {
      return 'STATEMENT';
    }
    return 'OTHER';
  };

  useEffect(() => {
    setInputType(detectInputType(message));
  }, [message]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message, inputType);
      setMessage("");
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'QUESTION': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'STATEMENT': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'QUESTION': return <HelpCircle className="h-3 w-3" />;
      case 'STATEMENT': return <MessageSquare className="h-3 w-3" />;
      default: return null;
    }
  };

  const charCount = message.length;
  const maxChars = 2000;

  return (
    <div className="border-t bg-background p-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-center justify-between">
          <Badge 
            variant="outline" 
            className={cn("text-xs", getTypeColor(inputType))}
          >
            {getTypeIcon(inputType)}
            <span className="ml-1">{inputType}</span>
          </Badge>
          <div className={cn(
            "text-xs",
            charCount > maxChars * 0.9 ? "text-destructive" : "text-muted-foreground"
          )}>
            {charCount}/{maxChars}
          </div>
        </div>
        
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, maxChars))}
              onKeyDown={handleKeyDown}
              placeholder="Share your thoughts or ask a question... (Press Enter to send, Shift+Enter for new line)"
              disabled={disabled}
              className="min-h-[60px] max-h-[200px] resize-none"
              rows={1}
            />
          </div>
          <Button 
            type="submit" 
            disabled={!message.trim() || disabled || charCount > maxChars}
            className="bg-democratic-blue hover:bg-democratic-blue/90"
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
};