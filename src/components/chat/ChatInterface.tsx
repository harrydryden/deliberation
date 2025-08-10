import { useState, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { ChatModeSelector, ChatMode } from "./ChatModeSelector";
import { useBackendChat } from "@/hooks/useBackendChat";
import { useMemoryLeakDetection } from '@/utils/performanceUtils';
import { logger } from '@/utils/logger';

export const ChatInterface = () => {
  const [chatMode, setChatMode] = useState<ChatMode>('chat');
  const {
    messages,
    isLoading,
    isTyping,
    sendMessage: originalSendMessage
  } = useBackendChat();
  
  useMemoryLeakDetection('ChatInterface');

  const sendMessage = useCallback(async (content: string) => {
    logger.component.update('ChatInterface', { mode: chatMode, contentLength: content.length });
    await originalSendMessage(content, chatMode);
  }, [chatMode, originalSendMessage]);
  return <Layout>
      <div className="h-[calc(100vh-120px)] flex flex-col bg-background rounded-lg border">
        <div className="sticky top-16 z-40 border-b p-4 bg-card/95 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-democratic-blue">Assisted Dying</h1>
              <p className="text-sm text-muted-foreground">Join the conversation, learn and share.</p>
            </div>
            <div className="flex items-center gap-2">
              <ChatModeSelector mode={chatMode} onModeChange={setChatMode} />
            </div>
          </div>
        </div>
        
        <MessageList messages={messages} isLoading={isLoading} isTyping={isTyping} />
        
        <MessageInput onSendMessage={sendMessage} disabled={isTyping} />
      </div>
    </Layout>;
};