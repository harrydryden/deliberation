import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseProactiveEngagementProps {
  user: any;
  lastActivityTime: number;
  onTriggerEngagement: () => void;
}

export const useProactiveEngagement = ({ 
  user, 
  lastActivityTime, 
  onTriggerEngagement 
}: UseProactiveEngagementProps) => {
  
  useEffect(() => {
    if (!user) return;

    const checkProactiveEngagement = () => {
      const minutesSinceLastActivity = (Date.now() - lastActivityTime) / 60000;
      
      // Trigger proactive engagement after 5 minutes of inactivity
      if (minutesSinceLastActivity >= 5) {
        console.log('Triggering proactive engagement check');
        onTriggerEngagement();
      }
    };

    // Check every minute
    const intervalId = setInterval(checkProactiveEngagement, 60000);

    return () => clearInterval(intervalId);
  }, [user, lastActivityTime, onTriggerEngagement]);

  const handleProactiveEngagement = async () => {
    if (!user) return;

    try {
      // Call orchestrator without content to trigger proactive engagement
      const { error: orchestratorError } = await supabase.functions.invoke(
        'ai-deliberation-orchestrator',
        {
          body: {
            user_id: user.id,
            // No content or message_id - signals proactive engagement check
          }
        }
      );

      if (orchestratorError) {
        console.error('Proactive engagement error:', orchestratorError);
      }
    } catch (error: any) {
      console.error('Error triggering proactive engagement:', error);
    }
  };

  return { handleProactiveEngagement };
};