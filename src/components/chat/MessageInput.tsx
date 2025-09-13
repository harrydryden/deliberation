import { useState, useRef, useEffect, useCallback, memo, useImperativeHandle, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";
import { useInputPreservation } from "@/hooks/useInputPreservation";

import { logger } from '@/utils/logger';

interface MessageInputProps {
  onSendMessage: (message: string, mode?: 'chat' | 'learn') => Promise<void> | void;
  disabled?: boolean;
  mode?: 'chat' | 'learn';
  deliberationId?: string; // For unique storage keys
}

export interface MessageInputRef {
  setMessage: (text: string) => void;
  clearMessage: () => void;
}

export const MessageInput = memo(forwardRef<MessageInputRef, MessageInputProps>(({ 
  onSendMessage, 
  disabled, 
  mode = 'chat',
  deliberationId 
}, ref) => {
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Input preservation with unique storage key per deliberation
  const storageKey = `message-draft-${deliberationId || 'default'}`;
  const { value: message, setValue: setMessage, clearStorage, isRestored } = useInputPreservation({
    storageKey,
    autoSaveDelay: 500, // Save more frequently for better UX
    preserveOnUnmount: true
  });

  useImperativeHandle(ref, () => ({
    setMessage: (text: string) => {
      setMessage(text);
      // Focus and resize after setting text
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
      });
    },
    clearMessage: () => {
      setMessage("");
      clearStorage();
    }
  }), [setMessage, clearStorage]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled && !isSubmitting) {
      const messageToSend = message.trim();
      setIsSubmitting(true);
      
      logger.info('MessageInput: Submitting message', { 
        mode, 
        messageLength: messageToSend.length,
        hasPreservedState: isRestored 
      });
      
      try {
        await onSendMessage(messageToSend, mode);
        setMessage("");
        clearStorage(); // Clear storage after successful send
        
        // Use requestAnimationFrame to ensure smooth transition
        requestAnimationFrame(() => {
          textareaRef.current?.focus();
        });
        
        logger.info('MessageInput: Message sent successfully');
      } catch (error) {
        logger.error('MessageInput: Failed to send message', error as Error);
      } finally {
        setIsSubmitting(false);
      }
    }
  }, [message, disabled, onSendMessage, isSubmitting, mode, setMessage, clearStorage, isRestored]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (message.trim() && !disabled && !isSubmitting) {
        handleSubmit(e);
      }
    }
  }, [message, disabled, isSubmitting, handleSubmit]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
  }, [setMessage]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  // Show restoration indicator briefly
  useEffect(() => {
    if (isRestored && message.trim()) {
      logger.info('MessageInput: Draft message restored', { 
        messageLength: message.length,
        storageKey 
      });
    }
  }, [isRestored, message, storageKey]);

  return (
    <div className="border-t bg-background p-4">
      {isRestored && message.trim() && (
        <div className="mb-2 text-xs text-muted-foreground opacity-75">
          � Draft restored
        </div>
      )}
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
}), (prevProps, nextProps) => {
  // Custom comparison to prevent unnecessary re-renders
  return (
    prevProps.disabled === nextProps.disabled &&
    prevProps.mode === nextProps.mode &&
    prevProps.deliberationId === nextProps.deliberationId &&
    prevProps.onSendMessage === nextProps.onSendMessage
  );
});