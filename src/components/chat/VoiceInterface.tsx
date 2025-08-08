import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeChat } from '@/hooks/useRealtimeChat';
import { supabase } from '@/integrations/supabase/client';
import { Mic, MicOff, Waves } from 'lucide-react';

interface VoiceInterfaceProps {
  deliberationId: string;
  preferredBillAgentId?: string;
  className?: string;
}

const VoiceInterface: React.FC<VoiceInterfaceProps> = ({ deliberationId, preferredBillAgentId, className }) => {
  const { toast } = useToast();
  const { connected, speaking, connect, disconnect, startMic, stopMic, sendText } = useRealtimeChat();
  const [mode, setMode] = useState<'idle' | 'bill' | 'ibis'>('idle');
  const [billAgentId, setBillAgentId] = useState<string | null>(preferredBillAgentId || null);

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

  const startBill = async () => {
    try {
      await ensureBillAgentId();
      await connect({ onToolCall: toolHandler });
      await startMic();
      setMode('bill');
      toast({ title: 'Bill voice connected', description: 'Two-way with knowledge tools enabled.' });
    } catch (err: any) {
      console.error('[VoiceInterface] Start Bill error', err);
      toast({ title: 'Error', description: err?.message || 'Failed to start Bill', variant: 'destructive' });
    }
  };

  const startIbis = async () => {
    try {
      await connect({ onToolCall: toolHandler });
      setMode('ibis');

      // Fetch IBIS context directly as a fallback to ensure audio
      const ctx = await doGetIbisContext(deliberationId, 10);
      const prompt = `${ctx}\n\nPlease speak a clear 30–60 second summary for participants.`;
      await sendText(prompt);

      toast({ title: 'IBIS summary', description: 'Generating spoken summary...' });
    } catch (err: any) {
      console.error('[VoiceInterface] Start IBIS error', err);
      toast({ title: 'Error', description: err?.message || 'Failed to start IBIS summary', variant: 'destructive' });
    }
  };

  const stop = () => {
    try { stopMic(); } catch {}
    try { disconnect(); } catch {}
    setMode('idle');
  };

  useEffect(() => () => stop(), []);

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        {mode !== 'bill' ? (
          <Button onClick={startBill} variant="secondary" size="sm" aria-label="Talk to Bill">
            <Mic className="h-4 w-4 mr-2" /> Talk to Bill
          </Button>
        ) : (
          <Button onClick={stop} variant="destructive" size="sm" aria-label="Stop Bill conversation">
            <MicOff className="h-4 w-4 mr-2" /> Stop Bill {speaking && <Waves className="h-4 w-4 ml-2" />}
          </Button>
        )}

        {mode !== 'ibis' ? (
          <Button onClick={startIbis} variant="default" size="sm" aria-label="Hear IBIS summary">
            Hear IBIS Summary
          </Button>
        ) : (
          <Button onClick={stop} variant="destructive" size="sm" aria-label="Stop IBIS summary">
            Stop Summary
          </Button>
        )}
      </div>
      {connected && mode === 'idle' && (
        <span className="ml-2 text-sm">Connected</span>
      )}
    </div>
  );
};

export default VoiceInterface;
