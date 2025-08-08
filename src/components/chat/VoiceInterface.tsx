import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeChat } from '@/hooks/useRealtimeChat';
import { Mic, MicOff, Waves } from 'lucide-react';

interface VoiceInterfaceProps {
  className?: string;
}

const VoiceInterface: React.FC<VoiceInterfaceProps> = ({ className }) => {
  const { toast } = useToast();
  const { connected, speaking, connect, disconnect, startMic, stopMic } = useRealtimeChat();
  const [active, setActive] = useState(false);

  const start = async () => {
    try {
      await connect();
      await startMic();
      setActive(true);
      toast({ title: 'Voice connected', description: 'Streaming enabled with VAD.' });
    } catch (err: any) {
      console.error('[VoiceInterface] Start error', err);
      toast({ title: 'Error', description: err?.message || 'Failed to start voice', variant: 'destructive' });
    }
  };

  const stop = () => {
    try { stopMic(); } catch {}
    try { disconnect(); } catch {}
    setActive(false);
  };

  useEffect(() => () => stop(), []);

  return (
    <div className={className}>
      {!active ? (
        <Button onClick={start} variant="secondary" size="sm" aria-label="Start voice conversation">
          <Mic className="h-4 w-4 mr-2" /> Start Voice
        </Button>
      ) : (
        <Button onClick={stop} variant="destructive" size="sm" aria-label="Stop voice conversation">
          <MicOff className="h-4 w-4 mr-2" /> Stop Voice {speaking && <Waves className="h-4 w-4 ml-2" />}
        </Button>
      )}
      {connected && !active && (
        <span className="ml-2 text-sm">Connected</span>
      )}
    </div>
  );
};

export default VoiceInterface;
