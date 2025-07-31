import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBackendAuth } from "@/hooks/useBackendAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { getErrorMessage, ValidationError } from "@/utils/errors";
import { accessCodeSchema, sanitizeInput, validateAndSanitize } from "@/utils/validation";

export const AuthForm = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [validationError, setValidationError] = useState<string>("");
  const { authenticate } = useBackendAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Simple validation only (performance focused)
    const sanitizedCode = sanitizeInput(accessCode);
    const validation = validateAndSanitize(accessCodeSchema, sanitizedCode);
    
    if (!validation.success) {
      const errorMessage = 'error' in validation ? validation.error : 'Validation failed';
      setValidationError(errorMessage);
      toast({
        variant: "destructive", 
        title: "Invalid Access Code",
        description: errorMessage
      });
      return;
    }

    setValidationError("");
    
    setIsLoading(true);
    console.log('🚀 Starting authentication process with code:', validation.data);
    
    try {
      await authenticate(validation.data);
      console.log('✅ Authentication successful, letting Auth page handle redirect...');
      toast({
        title: "Welcome!",
        description: "Successfully authenticated"
      });
      // Remove manual navigation - let Auth page handle redirect
    } catch (error: any) {
      console.error('❌ Authentication failed:', error);
      toast({
        variant: "destructive",
        title: "Authentication Failed",
        description: getErrorMessage(error)
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
            Enter Access Code
          </CardTitle>
          <CardDescription>
            Enter your access code to join the deliberation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="accessCode">Access Code</Label>
              <Input 
                id="accessCode" 
                type="text" 
                placeholder="Enter 10-digit access code"
                value={accessCode}
                maxLength={10}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, ''); // Only allow digits
                  setAccessCode(value);
                  if (validationError) setValidationError("");
                }}
                required 
                className={`text-center text-lg ${validationError ? 'border-red-500' : ''}`}
              />
              {validationError && (
                <p className="text-sm text-red-600 mt-1">{validationError}</p>
              )}
            </div>
            
            <Button 
              type="submit" 
              className="w-full bg-democratic-blue hover:bg-democratic-blue/90" 
              disabled={isLoading || accessCode.length < 1}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Join Deliberation
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};