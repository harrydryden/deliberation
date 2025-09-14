import { Button } from "@/components/ui/button";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { LogOut, User, MessageSquare, Settings, Brain } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";

export const Header = () => {
  const { user, isAdmin, signOut } = useSupabaseAuth();
  const navigate = useNavigate();
  return <header className="border-b bg-background backdrop-blur supports-[backdrop-filter]:bg-background/60" style={{
    position: 'sticky',
    top: 0,
    zIndex: 50,
    backgroundColor: 'hsl(var(--background) / 0.95)'
  }}>
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold text-democratic-blue cursor-pointer" onClick={() => navigate('/')}>
            Deliberation
          </h1>
        </div>
        
        {user && <div className="flex items-center space-x-4">
            {!isAdmin && (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate('/deliberations')} className="flex items-center space-x-1">
                  <MessageSquare className="h-4 w-4" />
                  <span>Deliberations</span>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/metrics')} className="flex items-center space-x-1">
                  <Brain className="h-4 w-4" />
                  <span>My Stats</span>
                </Button>
              </>
            )}
            {isAdmin && <Button variant="ghost" size="sm" onClick={() => navigate('/admin')} className="flex items-center space-x-1">
                <Settings className="h-4 w-4" />
                <span>Admin</span>
              </Button>}
            
            <Button variant="outline" size="sm" onClick={signOut} className="flex items-center space-x-1">
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </Button>
          </div>}
      </div>
    </header>;
};