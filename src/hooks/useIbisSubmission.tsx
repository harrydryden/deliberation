import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SubmitToIbisParams {
  messageId: string;
  nodeType?: 'issue' | 'position' | 'argument';
  title?: string;
}

export const useIbisSubmission = () => {
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);
  const { toast } = useToast();

  const submitToIbis = async ({ messageId, nodeType = 'position', title }: SubmitToIbisParams) => {
    setIsSubmitting(messageId);
    
    try {
      const { data, error } = await supabase.functions.invoke('submit-to-ibis', {
        body: {
          message_id: messageId,
          node_type: nodeType,
          title
        }
      });

      if (error) {
        console.error('IBIS submission error:', error);
        toast({
          title: "Submission Failed",
          description: error.message || "Failed to submit message to IBIS",
          variant: "destructive",
        });
        return false;
      }

      toast({
        title: "Message Submitted",
        description: "Your message has been successfully added to the IBIS knowledge base",
      });
      
      return true;
    } catch (error) {
      console.error('IBIS submission error:', error);
      toast({
        title: "Submission Failed",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsSubmitting(null);
    }
  };

  return {
    submitToIbis,
    isSubmitting
  };
};