import { useState, useCallback } from 'react';
import { useBackendChat } from '@/hooks/useBackendChat';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { ChatMessage } from '@/types/chat';

export const useChat = () => {
  const [inputValue, setInputValue] = useState('');
  const { handleAsyncError } = useErrorHandler();
  const {
    messages,
    isLoading,
    isTyping,
    sendMessage: backendSendMessage,
    loadChatHistory,
  } = useBackendChat();

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    await handleAsyncError(async () => {
      await backendSendMessage(content);
      setInputValue('');
    }, 'sending message');
  }, [backendSendMessage, isLoading, handleAsyncError]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    await sendMessage(inputValue);
  }, [inputValue, sendMessage]);

  const refreshChat = useCallback(async () => {
    await handleAsyncError(async () => {
      await loadChatHistory();
    }, 'refreshing chat');
  }, [loadChatHistory, handleAsyncError]);

  return {
    messages,
    inputValue,
    setInputValue,
    isLoading,
    isTyping,
    sendMessage,
    handleSubmit,
    refreshChat,
  };
};