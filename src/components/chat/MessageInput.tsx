import { useState, useRef, useEffect, useCallback, memo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";

interface MessageInputProps {
  onSendMessage: (message: string) => Promise<void> | void;
  disabled?: boolean;
  value?: string;
  onValueChange?: (text: string) => void;
}

export const MessageInput = memo(({ onSendMessage, disabled, value, onValueChange }: MessageInputProps) => {
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Use controlled value if provided, otherwise use internal state
  const currentMessage = value !== undefined ? value : message;
  const setCurrentMessage = (text: string) => {
    if (value !== undefined && onValueChange) {
      onValueChange(text);
    } else {
      setMessage(text);
    }
  };

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentMessage.trim() && !disabled && !isSubmitting) {
      setIsSubmitting(true);
      try {
        await onSendMessage(currentMessage);
        setCurrentMessage("");
        // Use requestAnimationFrame to ensure smooth transition
        requestAnimationFrame(() => {
          textareaRef.current?.focus();
        });
      } finally {
        setIsSubmitting(false);
      }
    }
  }, [currentMessage, disabled, onSendMessage, isSubmitting, setCurrentMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (currentMessage.trim() && !disabled && !isSubmitting) {
        handleSubmit(e);
      }
    }
  }, [currentMessage, disabled, isSubmitting, handleSubmit]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [currentMessage]);

  return (
    <div className="border-t bg-background p-4">
      <form onSubmit={handleSubmit} className="flex gap-2 items-end">
        <div className="flex-1">
          <Textarea
            ref={textareaRef}
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message here... (Press Enter to send, Shift+Enter for new line)"
            disabled={disabled}
            className="min-h-[60px] max-h-[200px] resize-none"
            rows={1}
          />
        </div>
        <Button 
          type="submit" 
          disabled={!currentMessage.trim() || disabled || isSubmitting}
          className="bg-democratic-blue hover:bg-democratic-blue/90 transition-all duration-200"
          size="icon"
        >
          {isSubmitting ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
});