import { useState, useEffect } from "react";

export interface SessionState {
  lastActivityTime: number;
  messageCount: number;
  statementCount: number;
  questionCount: number;
  topicsEngaged: string[];
  proactivePromptsCount: number;
  optedOutOfPrompts: boolean;
}

export const useSessionState = (userId: string | undefined) => {
  const [sessionState, setSessionState] = useState<SessionState>({
    lastActivityTime: Date.now(),
    messageCount: 0,
    statementCount: 0,
    questionCount: 0,
    topicsEngaged: [],
    proactivePromptsCount: 0,
    optedOutOfPrompts: false,
  });

  const updateActivity = (inputType?: string) => {
    setSessionState(prev => ({
      ...prev,
      lastActivityTime: Date.now(),
      messageCount: prev.messageCount + 1,
      statementCount: inputType === 'STATEMENT' ? prev.statementCount + 1 : prev.statementCount,
      questionCount: inputType === 'QUESTION' ? prev.questionCount + 1 : prev.questionCount,
    }));
  };

  const incrementProactivePrompts = () => {
    setSessionState(prev => ({
      ...prev,
      proactivePromptsCount: prev.proactivePromptsCount + 1,
    }));
  };

  const getMinutesSinceLastActivity = () => {
    return Math.floor((Date.now() - sessionState.lastActivityTime) / 60000);
  };

  return {
    sessionState,
    updateActivity,
    incrementProactivePrompts,
    getMinutesSinceLastActivity,
  };
};