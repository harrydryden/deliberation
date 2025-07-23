import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export const AuthForm = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleAccessCodeAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate access code format
      if (!/^\d{10}$/.test(accessCode)) {
        throw new Error("Access code must be exactly 10 digits");
      }

      // Check if access code exists
      const { data: codeData, error: codeError } = await supabase
        .from("access_codes")
        .select("id, code_type, is_used")
        .eq("code", accessCode)
        .maybeSingle();

      if (codeError) throw codeError;
      
      if (!codeData) {
        throw new Error("Invalid access code");
      }

      // Create temporary credentials
      const tempEmail = `user-${accessCode}@democraticdeliberation.app`;
      const tempPassword = `temp-${accessCode}-password`;

      // Try to sign in first (if user already exists)
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: tempEmail,
        password: tempPassword,
      });

      if (signInData.user && !signInError) {
        // Successfully signed in existing user
        toast({
          title: "Welcome back!",
          description: codeData.code_type === 'admin' ? "Welcome, Administrator!" : "Welcome to Democratic Deliberation!",
        });
        navigate("/chat");
        return;
      }

      // If sign in failed and access code is already used, throw error
      if (codeData.is_used) {
        throw new Error("This access code has already been used by another user");
      }

      // If user doesn't exist, sign them up
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: tempEmail,
        password: tempPassword,
        options: {
          data: {
            access_code: accessCode,
            user_role: codeData.code_type,
          }
        }
      });

      if (signUpError) {
        // If error is "user already exists", try signing in again
        if (signUpError.message.includes("User already registered")) {
          const { data: retrySignIn, error: retryError } = await supabase.auth.signInWithPassword({
            email: tempEmail,
            password: tempPassword,
          });
          
          if (retryError) throw new Error("Authentication failed. Please try again.");
          
          toast({
            title: "Welcome back!",
            description: codeData.code_type === 'admin' ? "Welcome, Administrator!" : "Welcome to Democratic Deliberation!",
          });
          navigate("/chat");
          return;
        }
        throw signUpError;
      }

      if (!signUpData.user) throw new Error("Failed to create user");

      // Mark the access code as used (only for new signups)
      const { data: markUsedResult, error: functionError } = await supabase
        .rpc('mark_access_code_used', {
          access_code: accessCode,
          user_uuid: signUpData.user.id
        });

      if (functionError) {
        console.error('Function call error:', functionError);
        // Fallback to direct update if function fails
        const { error: updateError } = await supabase
          .from("access_codes")
          .update({
            is_used: true,
            used_by: signUpData.user.id,
            used_at: new Date().toISOString()
          })
          .eq("code", accessCode);

        if (updateError) console.error('Direct update error:', updateError);
      }

      toast({
        title: "Access granted!",
        description: codeData.code_type === 'admin' ? "Welcome, Administrator!" : "Welcome to Democratic Deliberation!",
      });
      navigate("/chat");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Authentication Failed",
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-deliberation-bg p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-democratic-blue">
            Democratic Deliberation
          </CardTitle>
          <CardDescription>
            Enter your 10-digit access code to join the conversation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAccessCodeAuth} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="access-code">Access Code</Label>
              <Input
                id="access-code"
                type="text"
                placeholder="Enter your 10-digit access code"
                value={accessCode}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, ''); // Only allow digits
                  if (value.length <= 10) {
                    setAccessCode(value);
                  }
                }}
                maxLength={10}
                className="text-center tracking-widest font-mono text-lg"
                required
              />
              <p className="text-sm text-muted-foreground text-center">
                Enter the 10-digit code provided by your facilitator
              </p>
            </div>
            <Button
              type="submit"
              className="w-full bg-democratic-blue hover:bg-democratic-blue/90"
              disabled={isLoading || accessCode.length !== 10}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Access Platform
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};