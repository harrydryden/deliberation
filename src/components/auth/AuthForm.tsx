import { useState } from "react";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Network } from "lucide-react";
import { supabase } from '@/integrations/supabase/client';

export const AuthForm = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  
  const { signIn } = useSupabaseAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Simple validation
    if (!accessCode.trim() || accessCode.length !== 10) {
      toast({
        variant: "destructive",
        title: "Invalid Access Code",
        description: "Please enter a valid 10-digit access code"
      });
      return;
    }

    setIsLoading(true);
    
    try {
      // Use simplified validation function
      const { data, error } = await supabase.rpc('validate_access_code_simple', {
        input_code: accessCode.toUpperCase()
      });

      if (error) throw error;

      if (data?.valid) {
        // Set the user in the auth context
        // This component is now deprecated - redirect to Supabase form
        
        toast({
          title: "welcome",
          description: "",
          className: "w-32"
        });
      } else {
        toast({
          variant: "destructive",
          title: "Authentication Failed",
          description: data?.reason || 'Invalid access code'
        });
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      toast({
        variant: "destructive",
        title: "Authentication Error",
        description: "System temporarily unavailable. Please try again."
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-deliberation-bg p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-2">
            <Network className="h-6 w-6 text-democratic-blue mr-2" />
            <CardTitle className="text-2xl font-bold text-democratic-blue">
              Deliberation
            </CardTitle>
          </div>
          <CardDescription>
            welcome to the conversation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="accessCode">Access Code</Label>
              <Input 
                id="accessCode" 
                type="text" 
                placeholder="Enter 10-character access code"
                value={accessCode}
                maxLength={10}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
                  setAccessCode(value);
                }}
                required 
                className="text-center text-lg"
              />
            </div>
            
            <Button 
              type="submit" 
              className="w-full bg-democratic-blue hover:bg-democratic-blue/90" 
              disabled={isLoading || accessCode.length !== 10}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Open
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};