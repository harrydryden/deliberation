import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Key } from 'lucide-react';

export function PasswordSyncButton() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const syncPasswords = async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke('sync-user-passwords', {
        body: {},
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });

      if (error) throw error;

      toast({
        title: "Password Sync Complete",
        description: `Updated ${data.updated} user passwords${data.errors > 0 ? `, ${data.errors} errors` : ''}`,
      });

    } catch (error: any) {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button 
      onClick={syncPasswords}
      disabled={isLoading}
      variant="outline"
      className="mb-4"
    >
      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      <Key className="mr-2 h-4 w-4" />
      Sync All Passwords with Access Codes
    </Button>
  );
}