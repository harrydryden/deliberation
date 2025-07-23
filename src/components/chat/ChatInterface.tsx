import { Layout } from "@/components/layout/Layout";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { useChat } from "@/hooks/useChat";

export const ChatInterface = () => {
  const { messages, isLoading, isTyping, sendMessage } = useChat();

  return (
    <Layout>
      <div className="h-[calc(100vh-120px)] flex flex-col bg-background rounded-lg border">
        <div className="border-b p-4 bg-card">
          <h1 className="text-xl font-semibold text-democratic-blue">
            Democratic Deliberation Chat
          </h1>
          <p className="text-sm text-muted-foreground">
            Engage with AI agents to explore ideas and participate in thoughtful dialogue
          </p>
        </div>
        
        <MessageList 
          messages={messages} 
          isLoading={isLoading} 
          isTyping={isTyping}
        />
        
        <MessageInput 
          onSendMessage={sendMessage}
          disabled={isTyping}
        />
      </div>
    </Layout>
  );
};