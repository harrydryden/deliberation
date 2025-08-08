import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Mic, MicOff, Waves, GitBranch, GraduationCap, ChevronDown } from 'lucide-react';
import { RealtimeRTC } from '@/utils/realtimeRtc';

interface VoiceInterfaceProps {
  deliberationId: string;
  preferredBillAgentId?: string;
  className?: string;
  variant?: 'default' | 'toggle' | 'panel';
}

const VoiceInterface: React.FC<VoiceInterfaceProps> = ({ deliberationId, preferredBillAgentId, className, variant = 'default' }) => {
  const { toast } = useToast();
  const [connected, setConnected] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [mode, setMode] = useState<'idle' | 'bill' | 'ibis'>('idle');
  const [billAgentId, setBillAgentId] = useState<string | null>(preferredBillAgentId || null);
  const rtcRef = useRef<RealtimeRTC | null>(null);
  const [preferred, setPreferred] = useState<'bill' | 'ibis'>('bill');

  const selectPreferred = async (next: 'bill' | 'ibis') => {
    setPreferred(next);
    if (mode !== 'idle') {
      await stop();
      if (next === 'bill') await startBill();
      else await startIbis();
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
      console.error('[VoiceInterface] Failed to fetch Bill agent id', err);
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
    } catch (err: any) {
      console.error('[VoiceInterface] search_knowledge error', err);
      return 'Knowledge search failed.';
    }
  };

  const doGetIbisContext = async (delibId: string, maxItems: number = 10): Promise<string> => {
    try {
      const { data: nodes, error } = await supabase
        .from('ibis_nodes')
        .select('id, title, node_type, created_at')
        .eq('deliberation_id', delibId)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      const issues = (nodes || []).filter((n: any) => n.node_type === 'issue');
      const positions = (nodes || []).filter((n: any) => n.node_type === 'position');
      const argumentsN = (nodes || []).filter((n: any) => n.node_type === 'argument');
      const topIssues = issues.slice(0, Math.min(maxItems, 5)).map((i: any) => `- ${i.title}`).join('\n');
      return [
        'IBIS highlights:',
        `Issues (${issues.length}):`,
        topIssues || '- (none)',
        `Positions: ${positions.length}`,
        `Arguments: ${argumentsN.length}`,
        'Provide a clear 30–60 second spoken summary for participants.'
      ].join('\n');
    } catch (err) {
      console.error('[VoiceInterface] get_ibis_context error', err);
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

  const handleEvent = (event: any) => {
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
    if (mode !== 'idle') {
      stop();
      await new Promise((r) => setTimeout(r, 300));
    }
  };

  const startBill = async () => {
    try {
      await ensureIdle();
      await ensureBillAgentId();
      rtcRef.current = new RealtimeRTC();
      await rtcRef.current.init({ onEvent: handleEvent, onToolCall: toolHandler });
      setConnected(true);
      setMode('bill');
      toast({ title: 'Bill voice connected', description: 'Two-way with knowledge tools enabled.' });
    } catch (err: any) {
      console.error('[VoiceInterface] Start Bill error', err);
      toast({ title: 'Error', description: err?.message || 'Failed to start Bill', variant: 'destructive' });
    }
  };

  const startIbis = async () => {
    try {
      await ensureIdle();
      rtcRef.current = new RealtimeRTC();
      await rtcRef.current.init({ onEvent: handleEvent, onToolCall: toolHandler });
      setConnected(true);
      setMode('ibis');

      // Fetch IBIS context directly as a fallback to ensure audio
      const ctx = await doGetIbisContext(deliberationId, 10);
      const prompt = `${ctx}\n\nPlease speak a clear 30–60 second summary for participants.`;
      rtcRef.current.sendText(prompt);

      toast({ title: 'IBIS summary', description: 'Generating spoken summary...' });
    } catch (err: any) {
      console.error('[VoiceInterface] Start IBIS error', err);
      toast({ title: 'Error', description: err?.message || 'Failed to start IBIS summary', variant: 'destructive' });
    }
  };

  const stop = async () => {
    try { rtcRef.current?.cancelSpeaking?.(); } catch {}
    await new Promise((r) => setTimeout(r, 150));
    try { rtcRef.current?.disconnect(); } catch {}
    rtcRef.current = null;
    setConnected(false);
    setSpeaking(false);
    setMode('idle');
  };

  useEffect(() => { return () => { void stop(); }; }, []);

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
                {preferred === 'bill' ? <GraduationCap className="h-4 w-4" /> : <GitBranch className="h-4 w-4" />}
                <span className="ml-1">{preferred === 'bill' ? 'Learn (Bill)' : 'IBIS Summary'}</span>
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
                } else {
                  void startIbis();
                }
              } else {
                void stop();
              }
            }}
            className="data-[state=checked]:bg-primary"
          />
        </div>
      ) : (
        variant === 'panel' ? (
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => { mode === 'bill' ? void stop() : void startBill(); }}
              variant={mode === 'bill' ? 'default' : 'secondary'}
              size="sm"
              aria-label="Talk to Bill"
              aria-pressed={mode === 'bill'}
              className="w-full"
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
              className="w-full"
            >
              Hear IBIS Summary
              {mode === 'ibis' && speaking && <Waves className="h-4 w-4 ml-2" />}
            </Button>
          </div>
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
          </div>
        )
      )}
    </div>
  );
};

export default VoiceInterface;
