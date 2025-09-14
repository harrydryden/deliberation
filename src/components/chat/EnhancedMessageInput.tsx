import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Send, HelpCircle, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { logger } from "@/utils/logger";

interface EnhancedMessageInputProps {
  onSendMessage: (message: string, type: 'QUESTION' | 'STATEMENT' | 'OTHER') => void;
  disabled?: boolean;
}

export const EnhancedMessageInput = memo(({ onSendMessage, disabled }: EnhancedMessageInputProps) => {

  const [message, setMessage] = useState("");
  const [inputType, setInputType] = useState<'QUESTION' | 'STATEMENT' | 'OTHER'>('OTHER');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // PERFORMANCE: Memoized input type detection with regex caching
  const questionRegex = useMemo(() => /^(what|how|why|when|where)\b/i, []);
  
  const detectInputType = useCallback((text: string): 'QUESTION' | 'STATEMENT' | 'OTHER' => {
    const trimmed = text.trim();
    if (trimmed.endsWith('?') || questionRegex.test(trimmed)) {
      return 'QUESTION';
    }
    if (trimmed.length > 10) {
      return 'STATEMENT';
    }
    return 'OTHER';
  }, [questionRegex]);

  // Throttled input type detection to reduce updates during typing
  const throttledDetectInputType = useMemo(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    return (text: string) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setInputType(detectInputType(text));
      }, 150); // 150ms throttle
    };
  }, [detectInputType]);

  useEffect(() => {
    throttledDetectInputType(message);
  }, [message, throttledDetectInputType]);

  // Memoized event handlers
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message, inputType);
      setMessage("");
      textareaRef.current?.focus();
    }
  }, [message, disabled, onSendMessage, inputType]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }, [handleSubmit]);

  // PERFORMANCE: Memoized string operations
  const maxChars = useMemo(() => 2000, []);
  
  const handleMessageChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value.slice(0, maxChars);
    setMessage(newValue);
  }, [maxChars]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  // Memoized UI helpers
  const typeConfig = useMemo(() => {
    const configs = {
      QUESTION: { 
        color: 'bg-blue-100 text-blue-800 border-blue-200', 
        icon: <HelpCircle className="h-3 w-3" /> 
      },
      STATEMENT: { 
        color: 'bg-green-100 text-green-800 border-green-200', 
        icon: <MessageSquare className="h-3 w-3" /> 
      },
      OTHER: { 
        color: 'bg-gray-100 text-gray-600 border-gray-200', 
        icon: null 
      }
    };
    return configs[inputType];
  }, [inputType]);

  const charCount = message.length;
  
  const charCountColor = useMemo(() => 
    charCount > maxChars * 0.9 ? "text-destructive" : "text-muted-foreground",
    [charCount, maxChars]
  );

  const isSubmitDisabled = useMemo(() => 
    !message.trim() || disabled || charCount > maxChars,
    [message, disabled, charCount, maxChars]
  );

  return (
    <div className="border-t bg-background p-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-center justify-between">
          <Badge 
            variant="outline" 
            className={cn("text-xs", typeConfig.color)}
          >
            {typeConfig.icon}
            <span className="ml-1">{inputType}</span>
          </Badge>
          <div className={cn("text-xs", charCountColor)}>
            {charCount}/{maxChars}
          </div>
        </div>
        
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={handleMessageChange}
              onKeyDown={handleKeyDown}
              placeholder="Share your thoughts or ask a question... (Press Enter to send, Shift+Enter for new line)"
              disabled={disabled}
              className="min-h-[60px] max-h-[200px] resize-none"
              rows={1}
            />
          </div>
          <Button 
            type="submit" 
            disabled={isSubmitDisabled}
            className="bg-democratic-blue hover:bg-democratic-blue/90"
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
});

EnhancedMessageInput.displayName = 'EnhancedMessageInput';