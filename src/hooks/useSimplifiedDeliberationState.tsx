import { useState, useCallback, useMemo } from 'react';
import { ChatMode } from '@/components/chat/ChatModeSelector';
import { ViewMode } from '@/components/chat/ViewModeSelector';

interface Deliberation {
  id: string;
  title: string;
  description?: string;
  notion?: string;
  status: 'draft' | 'active' | 'concluded';
  facilitator_id?: string;
  is_public: boolean;
  max_participants: number;
  participants?: any[];
  participant_count?: number;
  created_at?: string;
}

interface DeliberationState {
  // UI State
  chatMode: ChatMode;
  viewMode: ViewMode;
  isDescriptionOpen: boolean;
  modalContent: 'description' | 'notion';
  isHeaderCollapsed: boolean;
  
  // Data State
  loading: boolean;
  deliberation: Deliberation | null;
  isParticipant: boolean;
  agentConfigs: Array<{agent_type: string; name: string; description?: string;}>;
  joiningDeliberation: boolean;
  error: string | null;
  
  // User Metrics
  engagement: number;
  shares: number;
  sessions: number;
  stanceScore: number;
  
  // IBIS Modal
  ibisModalOpen: boolean;
  ibisMessageId: string;
  ibisMessageContent: string;
}

const initialState: DeliberationState = {
  // UI State
  chatMode: 'chat' as ChatMode,
  viewMode: 'chat' as ViewMode,
  isDescriptionOpen: false,
  modalContent: 'description',
  isHeaderCollapsed: false,
  
  // Data State
  loading: true,
  deliberation: null,
  isParticipant: false,
  agentConfigs: [],
  joiningDeliberation: false,
  error: null,
  
  // User Metrics
  engagement: 0,
  shares: 0,
  sessions: 1,
  stanceScore: 0,
  
  // IBIS Modal
  ibisModalOpen: false,
  ibisMessageId: '',
  ibisMessageContent: ''
};

export const useSimplifiedDeliberationState = () => {
  const [state, setState] = useState<DeliberationState>(initialState);

  // Optimized batch state updater
  const updateState = useCallback((updates: Partial<DeliberationState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  // Specialized updaters for common operations
  const updateUI = useCallback((uiUpdates: Partial<Pick<DeliberationState, 'chatMode' | 'viewMode' | 'isDescriptionOpen' | 'modalContent' | 'isHeaderCollapsed'>>) => {
    setState(prev => ({ ...prev, ...uiUpdates }));
  }, []);

  const updateData = useCallback((dataUpdates: Partial<Pick<DeliberationState, 'loading' | 'deliberation' | 'isParticipant' | 'agentConfigs' | 'joiningDeliberation' | 'error'>>) => {
    setState(prev => ({ ...prev, ...dataUpdates }));
  }, []);

  const updateMetrics = useCallback((metricsUpdates: Partial<Pick<DeliberationState, 'engagement' | 'shares' | 'sessions' | 'stanceScore'>>) => {
    setState(prev => ({ ...prev, ...metricsUpdates }));
  }, []);

  const updateIbisModal = useCallback((modalUpdates: Partial<Pick<DeliberationState, 'ibisModalOpen' | 'ibisMessageId' | 'ibisMessageContent'>>) => {
    setState(prev => ({ ...prev, ...modalUpdates }));
  }, []);

  // Memoized selectors for performance
  const selectors = useMemo(() => ({
    uiState: {
      chatMode: state.chatMode,
      viewMode: state.viewMode,
      isDescriptionOpen: state.isDescriptionOpen,
      modalContent: state.modalContent,
      isHeaderCollapsed: state.isHeaderCollapsed
    },
    dataState: {
      loading: state.loading,
      deliberation: state.deliberation,
      isParticipant: state.isParticipant,
      agentConfigs: state.agentConfigs,
      joiningDeliberation: state.joiningDeliberation,
      error: state.error
    },
    userMetrics: {
      engagement: state.engagement,
      shares: state.shares,
      sessions: state.sessions,
      stanceScore: state.stanceScore
    },
    ibisModal: {
      isOpen: state.ibisModalOpen,
      messageId: state.ibisMessageId,
      messageContent: state.ibisMessageContent
    }
  }), [state]);

  return {
    state: selectors,
    updateState,
    updateUI,
    updateData,
    updateMetrics,
    updateIbisModal
  };
};