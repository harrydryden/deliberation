import { Button } from "@/components/ui/button";
import { useBackendAuth } from "@/hooks/useBackendAuth";
import { LogOut, User, MessageSquare, Settings, Brain } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";

export const Header = () => {
  const { user, signOut } = useBackendAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-4">
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
            {user.role === 'admin' && (
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
                {user.profile?.displayName || `User ${user.accessCode}`}
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