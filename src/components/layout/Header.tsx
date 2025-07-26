import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useBackendAuth } from "@/hooks/useBackendAuth";
import { useBackend } from "@/contexts/BackendContext";
import { LogOut, User, MessageSquare, Settings } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { BackendToggle } from "@/components/BackendToggle";

export const Header = () => {
  const { useNodeBackend } = useBackend();
  const supabaseAuth = useAuth();
  const backendAuth = useBackendAuth();
  const navigate = useNavigate();
  
  // Use the appropriate auth based on backend selection
  const { user, signOut } = useNodeBackend ? backendAuth : supabaseAuth;

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold text-democratic-blue cursor-pointer" onClick={() => navigate('/')}>
            Deliberation
          </h1>
          <BackendToggle />
        </div>
        
        {user && (
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/chat')}
              className="flex items-center space-x-1"
            >
              <MessageSquare className="h-4 w-4" />
              <span>Chat</span>
            </Button>
            {(!useNodeBackend && (user as any).user_metadata?.user_role === 'admin') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/admin')}
                className="flex items-center space-x-1"
              >
                <Settings className="h-4 w-4" />
                <span>Admin</span>
              </Button>
            )}
            <div className="flex items-center space-x-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback>
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">
                {useNodeBackend 
                  ? (user as any).displayName || user.email 
                  : ((user as any).user_metadata?.user_role === 'admin' ? 'Administrator' : 'Participant')
                }
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={signOut}
              className="flex items-center space-x-1"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
};