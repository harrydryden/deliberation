import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { useSessionTracking } from '@/hooks/useSessionTracking';
import { useRealtimeActivityTracking } from '@/hooks/useRealtimeActivityTracking';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { supabase } from '@/integrations/supabase/client';
import { Mic, MicOff, Waves, GitBranch, GraduationCap, ChevronDown, Type, AudioLines, Clock } from 'lucide-react';
import { RealtimeRTC } from '@/utils/realtimeRtc';
import { SessionManager } from '@/utils/sessionManager';
import { logger } from '@/utils/logger';
// Local interface for voice events
interface VoiceEvent {
  type: string;
  error?: {
    code: string;
    message: string;
  };
  response?: {
    status: string;
    status_details?: {
      error?: {
        message: string;
      };
    };
  };
}
interface VoiceInterfaceProps {
  deliberationId: string;
  preferredBillAgentId?: string;
  className?: string;
  variant?: 'default' | 'toggle' | 'panel';
  sendMessage?: (content: string) => Promise<void>;
  setMessageText?: (text: string) => void;
}

const VoiceInterface: React.FC<VoiceInterfaceProps> = ({ deliberationId, preferredBillAgentId, className, variant = 'default', sendMessage: sendChatMessage, setMessageText }) => {
  const { user } = useSupabaseAuth();
  const { toast } = useToast();
  const { currentSession, updateActivity } = useSessionTracking();
  const { recordVoiceInteraction } = useRealtimeActivityTracking({
    userId: user?.id,
    deliberationId,
    enabled: !!currentSession
  });
  const [connected, setConnected] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [mode, setMode] = useState<'idle' | 'bill' | 'ibis' | 'stt'>('idle');
  const [billAgentId, setBillAgentId] = useState<string | null>(preferredBillAgentId || null);
  const rtcRef = useRef<RealtimeRTC | null>(null);
  const [preferred, setPreferred] = useState<'bill' | 'ibis' | 'stt'>('bill');
  
  // STT recording state
  const sttStreamRef = useRef<MediaStream | null>(null);
  const sttRecorderRef = useRef<MediaRecorder | null>(null);
  const sttChunksRef = useRef<BlobPart[]>([]);
  const [sttBusy, setSttBusy] = useState(false);

  // Session management
  const sessionManagerRef = useRef<SessionManager | null>(null);
  const [sessionStatus, setSessionStatus] = useState({
    remainingTime: 0,
    needsRenewal: false,
    sessionAge: 0
  });
  const selectPreferred = async (next: 'bill' | 'ibis' | 'stt') => {
    setPreferred(next);
    if (mode !== 'idle') {
      await stop();
      if (next === 'bill') await startBill();
      else if (next === 'ibis') await startIbis();
      else await startStt();
    }
  };

  const ensureBillAgentId = async (): Promise<string | null> => {
    if (billAgentId) return billAgentId;
    try {
      const { data, error } = await supabase
        .from('agent_configurations')
        .select('id')
        .eq('deliberation_id', deliberationId)
        .eq('agent_type', 'bill_agent')
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .limit(1);
      if (error) throw error;
      const id = data?.[0]?.id || null;
      setBillAgentId(id);
      return id;
    } catch (err) {
      logger.error('Failed to fetch Bill agent id', err as Error);
      toast({ title: 'Error', description: 'No Bill agent found for this deliberation', variant: 'destructive' });
      return null;
    }
  };

  const doSearchKnowledge = async (query: string, agentId?: string, maxResults: number = 5): Promise<string> => {
    const finalAgentId = agentId || (await ensureBillAgentId());
    if (!finalAgentId) return 'No agent available for knowledge search.';
    try {
      const { data, error } = await supabase.functions.invoke('langchain-query-knowledge', {
        body: { query, agentId: finalAgentId, maxResults },
      });
      if (error) throw error;
      const sources = Array.isArray(data?.sources) ? data.sources.join(', ') : '';
      const response = data?.response || data?.generatedText || 'No result.';
      return `Knowledge digest:\n${response}${sources ? `\nSources: ${sources}` : ''}`;
    } catch (err: unknown) {
      const error = err as Error;
      logger.error('search_knowledge error', error);
      return 'Knowledge search failed.';
    }
  };

  const analyzeDeliberationComplexity = async (delibId: string): Promise<{ 
    duration: string; 
    maxItems: number; 
    totalNodes: number;
    instructions: string;
  }> => {
    try {
      const { data: nodes, error } = await supabase
        .from('ibis_nodes')
        .select('id, title, description, node_type, created_at')
        .eq('deliberation_id', delibId)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const totalNodes = (nodes || []).length;
      
      // Calculate dynamic duration and content based on complexity
      let duration: string;
      let maxItems: number;
      let instructions: string;

      if (totalNodes < 10) {
        // Small deliberation: 30-60 seconds
        duration = "30–60 seconds";
        maxItems = 5;
        instructions = "You are a civic deliberation assistant. Always speak responses. When asked to analyze policy, first search the local agent knowledge with the 'search_knowledge' tool to ground your answer. When asked for IBIS highlights or a summary, use the 'get_ibis_context' tool and then narrate a clear, concise 30–60 second spoken summary focusing on the key issues.";
      } else if (totalNodes < 50) {
        // Medium deliberation: 2-3 minutes
        duration = "2–3 minutes";
        maxItems = 15;
        instructions = "You are a civic deliberation assistant. Always speak responses. When asked to analyze policy, first search the local agent knowledge with the 'search_knowledge' tool to ground your answer. When asked for IBIS highlights or a summary, use the 'get_ibis_context' tool and then narrate a comprehensive 2–3 minute spoken summary that covers key issues, positions, and their relationships. Provide detailed context for participants.";
      } else {
        // Large deliberation: 5-7 minutes
        duration = "5–7 minutes";
        maxItems = 30;
        instructions = "You are a civic deliberation assistant. Always speak responses. When asked to analyze policy, first search the local agent knowledge with the 'search_knowledge' tool to ground your answer. When asked for IBIS highlights or a summary, use the 'get_ibis_context' tool and then narrate a complete 5–7 minute spoken analysis that thoroughly covers all major themes, issue-position relationships, argument patterns, and deliberation evolution. Provide comprehensive insights for participants.";
      }

      return { duration, maxItems, totalNodes, instructions };
    } catch (err) {
      logger.error('complexity analysis error', err as Error);
      return {
        duration: "30–60 seconds",
        maxItems: 5,
        totalNodes: 0,
        instructions: "You are a civic deliberation assistant. Always speak responses. When asked for IBIS highlights or a summary, provide a clear, concise spoken summary."
      };
    }
  };

  const doGetIbisContext = async (delibId: string, maxItems: number = 10): Promise<string> => {
    try {
      const { data: nodes, error } = await supabase
        .from('ibis_nodes')
        .select('id, title, description, node_type, created_at')
        .eq('deliberation_id', delibId)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const issues = (nodes || []).filter((n: any) => n.node_type === 'issue');
      const positions = (nodes || []).filter((n: any) => n.node_type === 'position');
      const argumentsN = (nodes || []).filter((n: any) => n.node_type === 'argument');
      
      // Enhanced content retrieval based on maxItems
      const selectedIssues = issues.slice(0, Math.min(maxItems, issues.length));
      const selectedPositions = positions.slice(0, Math.min(maxItems, positions.length));
      const selectedArguments = argumentsN.slice(0, Math.min(maxItems, argumentsN.length));

      const issueDetails = selectedIssues.map((i: any) => 
        `- ${i.title}${i.description ? `: ${i.description.substring(0, 100)}...` : ''}`
      ).join('\n');

      const positionDetails = selectedPositions.map((p: any) => 
        `- ${p.title}${p.description ? `: ${p.description.substring(0, 100)}...` : ''}`
      ).join('\n');

      return [
        'IBIS deliberation context:',
        `Total nodes: ${nodes.length}`,
        `Issues (${issues.length}):`,
        issueDetails || '- (none)',
        `Positions (${positions.length}):`,
        positionDetails || '- (none)',
        `Arguments: ${argumentsN.length}`,
        maxItems > 10 ? 'Provide a comprehensive spoken summary covering all major themes and relationships.' : 'Provide a clear spoken summary for participants.'
      ].join('\n');
    } catch (err) {
      logger.error('get_ibis_context error', err as Error);
      return 'Unable to load IBIS context.';
    }
  };

  const toolHandler = async (e: { name?: string; call_id: string; arguments: string }) => {
    const name = e.name;
    let args: any = {};
    try { args = e.arguments ? JSON.parse(e.arguments) : {}; } catch {}
    if (name === 'search_knowledge') {
      const query = args.query as string;
      const agentId = args.agentId as string | undefined;
      const maxResults = typeof args.maxResults === 'number' ? args.maxResults : 5;
      return await doSearchKnowledge(query, agentId, maxResults);
    }
    if (name === 'get_ibis_context') {
      const delibId = (args.deliberationId as string) || deliberationId;
      const maxItems = typeof args.maxItems === 'number' ? args.maxItems : 10;
      return await doGetIbisContext(delibId, maxItems);
    }
    return;
  };

  const handleEvent = (event: VoiceEvent) => {
    // Update session activity for any event
    updateActivity();
    recordVoiceInteraction('message', undefined);
    
    // Handle session expired and other critical errors
    if (event?.type === 'error') {
      const errorCode = event?.error?.code;
      const errorMessage = event?.error?.message;
      
      // Record error in session manager
      sessionManagerRef.current?.recordError();
      
      if (errorCode === 'session_expired') {
        logger.warn('Session expired, forcing cleanup');
        toast({ title: 'Session expired', description: 'Voice session expired. Click to restart.', variant: 'destructive' });
        // Force immediate cleanup and reset
        void stop();
        return;
      }
      
      // Handle other errors
      logger.error('RTC Error', new Error(event?.error?.message || 'Unknown RTC error'), { event });
      toast({ title: 'Voice error', description: errorMessage || 'Voice connection error', variant: 'destructive' });
      return;
    }

    // Minimal speaking indicator using response lifecycle
    if (event?.type === 'response.created') setSpeaking(true);

    if (event?.type === 'response.done') {
      setSpeaking(false);
      const status = event?.response?.status;
      if (status === 'failed') {
        const msg = event?.response?.status_details?.error?.message || 'Voice generation failed.';
        toast({ title: 'Voice error', description: msg, variant: 'destructive' });
      }
    }

    if (event?.type === 'response.audio.done') setSpeaking(false);

    if (event?.type === 'conversation.item.input_audio_transcription.failed') {
      const msg = event?.error?.message || 'Transcription failed.';
      toast({ title: 'Transcription error', description: msg, variant: 'destructive' });
    }
  };

  const ensureIdle = async () => {
    logger.debug('ensureIdle called', { currentMode: mode });
    
    // Always force cleanup, regardless of current mode, to handle expired sessions
    logger.debug('Forcing complete cleanup of any existing connections');
    
    // Force stop any RTC connections immediately
    if (rtcRef.current) {
      logger.debug('Disconnecting RTC immediately');
      try {
        rtcRef.current.cancelSpeaking?.();
        rtcRef.current.disconnect();
      } catch (e) {
        logger.warn('Error disconnecting RTC', e as Error);
      }
      rtcRef.current = null;
    }
    
    // Clean up STT connections if any
    if (sttRecorderRef.current) {
      try {
        sttRecorderRef.current.stop();
      } catch (e) {
        logger.warn('Error stopping STT recorder', e as Error);
      }
      sttRecorderRef.current = null;
    }
    
    if (sttStreamRef.current) {
      try {
        sttStreamRef.current.getTracks().forEach(t => t.stop());
      } catch (e) {
        logger.warn('Error stopping STT stream', e as Error);
      }
      sttStreamRef.current = null;
    }
    
    // Force reset all state
    setConnected(false);
    setSpeaking(false);
    setMode('idle');
    setSttBusy(false);
    
    // Wait for complete cleanup to handle session expiration
    logger.debug('Waiting for complete cleanup...');
    await new Promise((r) => setTimeout(r, 1500));
    logger.debug('Cleanup complete, ready for new session');
  };

  const createSessionManager = () => {
    return new SessionManager(
      {
        maxSessionAge: 25 * 60 * 1000, // 25 minutes
        renewalThreshold: 5 * 60 * 1000, // Renew 5 minutes before expiry
        maxRenewalAttempts: 2,
        healthCheckInterval: 30 * 1000
      },
      {
        onSessionExpired: () => {
          logger.warn('Session manager detected expiration');
          toast({ 
            title: 'Session expired', 
            description: 'Voice session expired. Please reconnect.', 
            variant: 'destructive' 
          });
          void stop();
        },
        onSessionRenewed: async (sessionId) => {
          logger.info('Session manager requesting renewal', { sessionId });
          // Attempt graceful renewal by reconnecting
          if (mode === 'bill') {
            await gracefulReconnect(() => startBill());
          } else if (mode === 'ibis') {
            await gracefulReconnect(() => startIbis());
          }
        }
      }
    );
  };

  const gracefulReconnect = async (reconnectFn: () => Promise<void>) => {
    const wasConnected = connected;
    const currentMode = mode;
    
    if (!wasConnected) return;
    
    try {
      logger.info('Starting graceful reconnection', { currentMode });
      toast({ title: 'Reconnecting...', description: 'Refreshing voice session' });
      
      await ensureIdle();
      await reconnectFn();
      
      logger.info('Graceful reconnection successful');
      toast({ title: 'Reconnected', description: 'Voice session refreshed successfully' });
    } catch (err: unknown) {
      const error = err as Error;
      logger.error('Graceful reconnection failed', error);
      toast({ 
        title: 'Reconnection failed', 
        description: 'Please manually restart the voice session', 
        variant: 'destructive' 
      });
    }
  };

  const startBill = async () => {
    try {
      await ensureIdle();
      await ensureBillAgentId();
      
      // Record voice interaction start
      recordVoiceInteraction('start');
      
      // Initialize session manager
      sessionManagerRef.current = createSessionManager();
      sessionManagerRef.current.startSession(`bill_${Date.now()}`);
      
      rtcRef.current = new RealtimeRTC();
      await rtcRef.current.init({ onEvent: handleEvent, onToolCall: toolHandler });
      setConnected(true);
      setMode('bill');
      
      // Start session status updates
      startSessionStatusUpdates();
      
      toast({ title: 'Bill voice connected', description: 'Two-way with knowledge tools enabled.' });
    } catch (err: unknown) {
      const error = err as Error;
      logger.error('Start Bill error', error);
      sessionManagerRef.current?.recordError();
      toast({ title: 'Error', description: error.message || 'Failed to start Bill', variant: 'destructive' });
    }
  };

  const startSessionStatusUpdates = () => {
    const interval = setInterval(() => {
      if (!sessionManagerRef.current) {
        clearInterval(interval);
        return;
      }
      
      const status = sessionManagerRef.current.getSessionStatus();
      setSessionStatus({
        remainingTime: status.remainingTime,
        needsRenewal: status.needsRenewal,
        sessionAge: status.sessionAge
      });
      
      if (!status.isActive) {
        clearInterval(interval);
      }
    }, 5000); // Update every 5 seconds
    
    // Store interval for cleanup
    return interval;
  };

  const formatTimeRemaining = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const startIbis = async () => {
    try {
      await ensureIdle();
      
      // Analyze deliberation complexity for dynamic duration
      const complexity = await analyzeDeliberationComplexity(deliberationId);
      
      // Initialize session manager
      sessionManagerRef.current = createSessionManager();
      sessionManagerRef.current.startSession(`ibis_${Date.now()}`);
      
      rtcRef.current = new RealtimeRTC();
      await rtcRef.current.init({ 
        onEvent: handleEvent, 
        onToolCall: toolHandler,
        dynamicInstructions: complexity.instructions
      });
      setConnected(true);
      setMode('ibis');

      // Start session status updates
      startSessionStatusUpdates();

      // Fetch IBIS context with appropriate detail level
      const ctx = await doGetIbisContext(deliberationId, complexity.maxItems);
      const prompt = `${ctx}\n\nPlease speak a ${complexity.duration} summary covering the deliberation's key insights.`;
      rtcRef.current.sendText(prompt);

      toast({ 
        title: 'IBIS summary', 
        description: complexity.totalNodes === 0 
          ? 'Generating summary for new deliberation...'
          : `Generating ${complexity.duration} summary for ${complexity.totalNodes} nodes...` 
      });
    } catch (err: unknown) {
      const error = err as Error;
      logger.error('Start IBIS error', error);
      sessionManagerRef.current?.recordError();
      toast({ title: 'Error', description: error.message || 'Failed to start IBIS summary', variant: 'destructive' });
    }
  };

  // Helper to base64-encode Blob
  const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64 || '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    } catch (e) {
      reject(e);
    }
  });

  const startStt = async () => {
    try {
      logger.debug('Starting STT mode');
      await ensureIdle();
      logger.debug('Idle ensured, starting STT recording');
      
      sttChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined;
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);

      rec.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) sttChunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        try {
          setSttBusy(true);
          const blob = new Blob(sttChunksRef.current, { type: 'audio/webm' });
          const b64 = await blobToBase64(blob);
          if (!b64) throw new Error('Empty recording');
          const { data, error } = await supabase.functions.invoke('voice-to-text', { body: { audio: b64 } });
          if (error) throw error;
          const text = (data?.text || '').toString().trim();
          logger.debug('STT transcription received', { text, setMessageTextAvailable: !!setMessageText, sendChatMessageAvailable: !!sendChatMessage });
          
          if (text.length > 0) {
            // STT mode should ONLY transcribe to message input, never send
            if (setMessageText) {
              logger.debug('Setting message text only, not sending');
              setMessageText(text);
              toast({ title: 'Text transcribed', description: 'Voice transcription added to message input.' });
            } else {
              logger.error('No setMessageText function provided');
              toast({ title: 'Error', description: 'No setMessageText function provided for dictation', variant: 'destructive' });
            }
          } else {
            logger.debug('No speech detected');
            toast({ title: 'No speech detected', description: 'Nothing was transcribed.', variant: 'destructive' });
          }
        } catch (err: unknown) {
          const error = err as Error;
          logger.error('STT error', error);
          toast({ title: 'Voice to text failed', description: error.message || 'Transcription error', variant: 'destructive' });
        } finally {
          setSttBusy(false);
          try { sttStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
          sttRecorderRef.current = null;
          sttStreamRef.current = null;
          setConnected(false);
          setMode('idle');
        }
      };

      sttStreamRef.current = stream;
      sttRecorderRef.current = rec;
      rec.start();
      setConnected(true);
      setMode('stt');
      toast({ title: 'Recording…', description: 'Toggle off to transcribe to message input.' });
    } catch (err: unknown) {
      const error = err as Error;
      logger.error('startStt error', error);
      toast({ title: 'Error', description: error.message || 'Failed to start recording', variant: 'destructive' });
    }
  };

  const stopStt = async (cancel?: boolean) => {
    try {
      const rec = sttRecorderRef.current;
      if (!rec) {
        setConnected(false);
        setMode('idle');
        return;
      }
      if (cancel) {
        // Stop without sending
        try { rec.stop(); } catch {}
        sttChunksRef.current = [];
        try { sttStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
        sttRecorderRef.current = null;
        sttStreamRef.current = null;
        setConnected(false);
        setMode('idle');
        return;
      }
      rec.stop();
    } catch (e) {
      logger.error('stopStt error', e as Error);
      setConnected(false);
      setMode('idle');
    }
  };

  const stop = async () => {
    try {
      logger.debug('stop called', { mode });
      const wasConnected = connected;
      
      // Record voice interaction end with duration  
      const sessionStartTime = sessionManagerRef.current?.getSessionStatus().sessionAge || 0;
      recordVoiceInteraction('end', sessionStartTime);
      
      // Stop session manager
      if (sessionManagerRef.current) {
        sessionManagerRef.current.stopSession();
        sessionManagerRef.current = null;
      }
      
      if (rtcRef.current) {
        logger.debug('Disconnecting RTC');
        rtcRef.current.disconnect();
        rtcRef.current = null;
      }
      
      setConnected(false);
      setSpeaking(false);
      setMode('idle');
      setSessionStatus({ remainingTime: 0, needsRenewal: false, sessionAge: 0 });
      
      if (wasConnected) {
        toast({ title: 'Voice disconnected', description: 'Session ended.' });
      }
    } catch (err: unknown) {
      const error = err as Error;
      logger.error('stop error', error);
    }
  };

  useEffect(() => {
    return () => {
      void stop();
      
      // Cleanup STT resources
      try { sttRecorderRef.current?.stop(); } catch {}
      try { sttStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
      
      // Cleanup session manager
      if (sessionManagerRef.current) {
        sessionManagerRef.current.stopSession();
      }
    };
  }, []);

  return (
    <div className={className}>
      {variant === 'toggle' ? (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/50 border">
          <div className={`flex items-center gap-2 text-sm ${mode !== 'idle' ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
            {mode !== 'idle' ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            <span>Voice</span>
            {speaking && <Waves className="h-4 w-4" />}
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="px-2 h-8 bg-muted/50">
                {preferred === 'bill' ? <GraduationCap className="h-4 w-4" /> : preferred === 'ibis' ? <GitBranch className="h-4 w-4" /> : <Type className="h-4 w-4" />}
                <span className="ml-1">{preferred === 'bill' ? 'Learn (Bill)' : preferred === 'ibis' ? 'IBIS Summary' : 'Dictate to Text'}</span>
                <ChevronDown className="h-4 w-4 ml-1 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-1">
              <button
                type="button"
                onClick={() => { void selectPreferred('bill'); }}
                className={`w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-sm ${preferred === 'bill' ? 'bg-muted text-foreground' : 'hover:bg-muted/60 text-muted-foreground'}`}
              >
                <GraduationCap className="h-4 w-4" />
                <span>Learn (Bill)</span>
              </button>
              <button
                type="button"
                onClick={() => { void selectPreferred('ibis'); }}
                className={`w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-sm ${preferred === 'ibis' ? 'bg-muted text-foreground' : 'hover:bg-muted/60 text-muted-foreground'}`}
              >
                <GitBranch className="h-4 w-4" />
                <span>IBIS Summary</span>
              </button>
            </PopoverContent>
          </Popover>

          <Switch
            checked={mode !== 'idle'}
            onCheckedChange={(checked) => {
              if (checked) {
                if (preferred === 'bill') {
                  void startBill();
                } else if (preferred === 'ibis') {
                  void startIbis();
                } else {
                  void startStt();
                }
              } else {
                if (mode === 'stt') {
                  void stopStt();
                } else {
                  void stop();
                }
              }
            }}
            className="data-[state=checked]:bg-primary"
          />
        </div>
      ) : (
        variant === 'panel' ? (
          <>
            <div className="flex items-center justify-between">
              {connected && sessionStatus.remainingTime > 0 && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span className={sessionStatus.needsRenewal ? 'text-amber-500' : ''}>
                    {formatTimeRemaining(sessionStatus.remainingTime)}
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Button
                onClick={() => { mode === 'bill' ? void stop() : void startBill(); }}
                variant={mode === 'bill' ? 'default' : 'secondary'}
                size="sm"
                aria-label="Chat to Policy"
                aria-pressed={mode === 'bill'}
                className="w-full h-8 text-xs"
              >
                <Mic className="h-3 w-3 mr-1" />
                Chat to Policy
                {mode === 'bill' && speaking && <Waves className="h-3 w-3 ml-1" />}
              </Button>

              <Button
                onClick={() => { mode === 'ibis' ? void stop() : void startIbis(); }}
                variant={mode === 'ibis' ? 'default' : 'secondary'}
                size="sm"
                aria-label="Deliberation Summary"
                aria-pressed={mode === 'ibis'}
                className="w-full h-8 text-xs"
              >
                <AudioLines className="h-3 w-3 mr-1" />
                Deliberation Summary
                {mode === 'ibis' && speaking && <Waves className="h-3 w-3 ml-1" />}
              </Button>

              <Button
                onClick={() => { mode === 'stt' ? void stopStt() : void startStt(); }}
                variant={mode === 'stt' ? 'default' : 'secondary'}
                size="sm"
                aria-label="Dictate to text"
                aria-pressed={mode === 'stt'}
                className="w-full h-8 text-xs"
              >
                <Type className="h-3 w-3 mr-1" />
                Dictate to Text
              </Button>
            </div>
          </>
        
        ) : (
          <div className="flex items-center gap-2">
            <Button
              onClick={() => { mode === 'bill' ? void stop() : void startBill(); }}
              variant={mode === 'bill' ? 'default' : 'secondary'}
              size="sm"
              aria-label="Talk to Bill"
              aria-pressed={mode === 'bill'}
            >
              <Mic className="h-4 w-4 mr-2" />
              Talk to Bill
              {mode === 'bill' && speaking && <Waves className="h-4 w-4 ml-2" />}
            </Button>

            <Button
              onClick={() => { mode === 'ibis' ? void stop() : void startIbis(); }}
              variant={mode === 'ibis' ? 'default' : 'secondary'}
              size="sm"
              aria-label="Hear IBIS summary"
              aria-pressed={mode === 'ibis'}
            >
              Hear IBIS Summary
              {mode === 'ibis' && speaking && <Waves className="h-4 w-4 ml-2" />}
            </Button>

            <Button
              onClick={() => { mode === 'stt' ? void stopStt() : void startStt(); }}
              variant={mode === 'stt' ? 'default' : 'secondary'}
              size="sm"
              aria-label="Dictate to text"
              aria-pressed={mode === 'stt'}
            >
              <Type className="h-4 w-4 mr-2" />
              Dictate to Text
            </Button>
          </div>
        )
      )}
    </div>
  );
};

export default VoiceInterface;
