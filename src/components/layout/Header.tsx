import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { LogOut, User, MessageSquare, Settings } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";

export const Header = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <h1 className="text-xl font-bold text-democratic-blue cursor-pointer" onClick={() => navigate('/')}>
            Deliberation
          </h1>
        </div>
        
        {user && (
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/deliberations')}
              className="flex items-center space-x-1"
            >
              <MessageSquare className="h-4 w-4" />
              <span>Deliberations</span>
            </Button>
            {user.user_metadata?.user_role === 'admin' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/agent-config')}
                className="flex items-center space-x-1"
              >
                <Settings className="h-4 w-4" />
                <span>Agent Config</span>
              </Button>
            )}
            <div className="flex items-center space-x-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback>
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">
                {user.user_metadata?.user_role === 'admin' ? 'Administrator' : 'Participant'}
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