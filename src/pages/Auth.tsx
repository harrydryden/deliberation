import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDeliberationService } from "@/hooks/useDeliberationService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from '@/utils/logger';

const Auth = () => {
  const { user, isLoading, isAdmin, signIn } = useSupabaseAuth();
  const navigate = useNavigate();
  const deliberationService = useDeliberationService();
  const [deliberations, setDeliberations] = useState<any[]>([]);
  
  // Form state
  const [accessCode1, setAccessCode1] = useState('');
  const [accessCode2, setAccessCode2] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    if (!isLoading && user) {
      loadDeliberations();
    }
  }, [user, isLoading]);

  const loadDeliberations = async () => {
    try {
      // Check if user is admin and redirect accordingly
      if (isAdmin) {
        navigate('/admin');
        return;
      }
      
      // First try to find the last deliberation the user wrote a message in
      const lastMessageDeliberation = await findLastMessageDeliberation();
      if (lastMessageDeliberation) {
        navigate(`/deliberations/${lastMessageDeliberation}`);
        return;
      }
      
      // Fallback to most recent active deliberation if no messages found
      const data = await deliberationService.getDeliberations();
      setDeliberations(data);
      
      if (data.length > 0) {
        // Find most recent active deliberation, or fallback to most recent
        const mostRecentDeliberation = data.find(d => d.status === 'active') || data[0];
        navigate(`/deliberations/${mostRecentDeliberation.id}`);
      } else {
        // No deliberations available, redirect to deliberations page
        navigate("/deliberations");
      }
    } catch (error) {
      // Check if user is admin even if deliberations fail to load
      if (isAdmin) {
        navigate('/admin');
      } else {
        // Fallback to deliberations page
        navigate("/deliberations");
      }
    }
  };

  const findLastMessageDeliberation = async (): Promise<string | null> => {
    try {
      if (!user?.id) return null;
      
      // Query for the user's most recent message with a deliberation_id
      const { data, error } = await supabase
        .from('messages')
        .select('deliberation_id')
        .eq('user_id', user.id)
        .not('deliberation_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data?.deliberation_id) {
        return null;
      }

      return data.deliberation_id;
    } catch (error) {
      logger.warn('Failed to find last message deliberation', error);
      return null;
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate access codes
    if (!accessCode1 || !accessCode2) {
      toast.error('Please enter both access codes');
      return;
    }
    
    if (accessCode1.length !== 5 || !/^[A-Z]{5}$/.test(accessCode1)) {
      toast.error('Access Code 1 must be 5 uppercase letters');
      return;
    }
    
    if (accessCode2.length !== 6 || !/^\d{6}$/.test(accessCode2)) {
      toast.error('Access Code 2 must be 6 digits');
      return;
    }
    
    setIsSigningIn(true);
    
    try {
      // Construct email from access code 1
      const email = `${accessCode1}@deliberation.local`;
      const password = accessCode2;
      
      const { error } = await signIn(email, password);
      
      if (error) {
        toast.error(error.message || 'Sign in failed');
      }
    } catch (error) {
      toast.error('An unexpected error occurred');
    } finally {
      setIsSigningIn(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }
  
  if (user) {
    const destinationText = isAdmin ? 'admin dashboard' : 'deliberations';
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Redirecting to {destinationText}...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center text-democratic-blue">Deliberation</CardTitle>
          <CardDescription className="text-center">
            Enter your access codes to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="accessCode1">Access Code 1 (5 letters)</Label>
              <Input
                id="accessCode1"
                type="text"
                value={accessCode1}
                onChange={(e) => setAccessCode1(e.target.value.toUpperCase())}
                placeholder="ABCDE"
                maxLength={5}
                pattern="[A-Z]{5}"
                className="font-mono tracking-wider"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accessCode2">Access Code 2 (6 digits)</Label>
              <Input
                id="accessCode2"
                type="password"
                value={accessCode2}
                onChange={(e) => setAccessCode2(e.target.value)}
                placeholder="123456"
                maxLength={6}
                pattern="[0-9]{6}"
                className="font-mono tracking-wider"
                required
              />
            </div>
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isSigningIn}
            >
              {isSigningIn ? 'Signing In...' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;