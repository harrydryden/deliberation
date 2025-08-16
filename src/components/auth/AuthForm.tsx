import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Network } from "lucide-react";
import { getErrorMessage } from "@/utils/errors";
import { logger } from '@/utils/logger';

export const AuthForm = () => {
  console.log('🔍 AuthForm component rendering');
  const [isLoading, setIsLoading] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [validationError, setValidationError] = useState<string>("");
  
  const { authenticateWithAccessCode } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isLoading) return;

    console.log('🔍 AuthForm validation state:', {
      validationError,
      isLoading,
      accessCode: accessCode.length
    });

    // Basic validation
    if (!accessCode || accessCode.length < 8) {
      setValidationError("Access code must be at least 8 characters");
      return;
    }

    try {
      setIsLoading(true);
      setValidationError("");
      
      logger.info('Starting authentication with access code');
      
      // Simple validation - in production, you'd validate against your access codes
      const isValidCode = accessCode.length >= 8 && accessCode.length <= 15;
      if (!isValidCode) {
        throw new Error('Invalid access code format');
      }
      
      // Determine user role based on code prefix or type
      const userRole = accessCode.startsWith('ADMIN') ? 'admin' : 'user';
      
      // Authenticate with the simplified system
      await authenticateWithAccessCode(accessCode, userRole);
      
      logger.info('Authentication successful');
      
      toast({
        title: "Authentication Successful",
        description: "Welcome! You have been authenticated.",
      });

      // Navigate to main app
      navigate("/");
      
    } catch (error: any) {
      logger.error('Authentication failed', error);
      const errorMessage = getErrorMessage(error);
      
      setValidationError(errorMessage);
      toast({
        variant: "destructive",
        title: "Authentication Failed",
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };
   
  console.log('🔍 AuthForm about to render JSX, accessCode:', accessCode);
  console.log('🔍 AuthForm validation state:', { validationError, isLoading });
  
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
            Welcome to the conversation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="accessCode">Access Code</Label>
              <Input 
                id="accessCode" 
                type="text" 
                placeholder="Enter your access code"
                value={accessCode}
                maxLength={15}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
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
              disabled={isLoading || accessCode.length < 8}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enter
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};