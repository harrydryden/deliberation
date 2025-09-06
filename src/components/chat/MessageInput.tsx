import { useState, useRef, useEffect, useCallback, memo, useImperativeHandle, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";

interface MessageInputProps {
  onSendMessage: (message: string) => Promise<void> | void;
  disabled?: boolean;
}

export interface MessageInputRef {
  setMessage: (text: string) => void;
  clearMessage: () => void;
}

export const MessageInput = memo(forwardRef<MessageInputRef, MessageInputProps>(({ onSendMessage, disabled }, ref) => {
  const [message, setMessageState] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    setMessage: (text: string) => {
      setMessageState(text);
      // Focus and resize after setting text
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
      });
    },
    clearMessage: () => setMessageState("")
  }), []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled && !isSubmitting) {
      setIsSubmitting(true);
      try {
        await onSendMessage(message);
        setMessageState("");
        // Use requestAnimationFrame to ensure smooth transition
        requestAnimationFrame(() => {
          textareaRef.current?.focus();
        });
      } finally {
        setIsSubmitting(false);
      }
    }
  }, [message, disabled, onSendMessage, isSubmitting]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (message.trim() && !disabled && !isSubmitting) {
        handleSubmit(e);
      }
    }
  }, [message, disabled, isSubmitting, handleSubmit]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageState(e.target.value);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  return (
    <div className="border-t bg-background p-4">
      <form onSubmit={handleSubmit} className="flex gap-2 items-end">
        <div className="flex-1">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Type your message here... (Press Enter to send, Shift+Enter for new line)"
            disabled={disabled}
            className="min-h-[60px] max-h-[200px] resize-none"
            rows={1}
          />
        </div>
        <Button 
          type="submit" 
          disabled={!message.trim() || disabled || isSubmitting}
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
}));