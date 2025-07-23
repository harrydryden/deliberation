import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RealtimeChannel } from "@supabase/supabase-js";

interface UserPresence {
  user_id: string;
  display_name: string;
  last_seen: string;
}

export function usePresence(deliberationId: string | undefined, userId: string | undefined, displayName: string | undefined) {
  const [onlineUsers, setOnlineUsers] = useState<UserPresence[]>([]);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!deliberationId || !userId || !displayName) return;

    const roomChannel = supabase.channel(`deliberation_${deliberationId}`);
    setChannel(roomChannel);

    const userStatus = {
      user_id: userId,
      display_name: displayName,
      last_seen: new Date().toISOString(),
    };

    roomChannel
      .on('presence', { event: 'sync' }, () => {
        const newState = roomChannel.presenceState();
        console.log('Presence sync:', newState);
        
        const users: UserPresence[] = [];
        Object.keys(newState).forEach(key => {
          const presences = newState[key] as any[];
          presences.forEach(presence => {
            users.push(presence);
          });
        });
        
        setOnlineUsers(users);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('User joined:', key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('User left:', key, leftPresences);
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;

        const presenceTrackStatus = await roomChannel.track(userStatus);
        console.log('Presence track status:', presenceTrackStatus);
      });

    // Update presence every 30 seconds
    const interval = setInterval(() => {
      roomChannel.track({
        ...userStatus,
        last_seen: new Date().toISOString(),
      });
    }, 30000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(roomChannel);
    };
  }, [deliberationId, userId, displayName]);

  return { onlineUsers };
}