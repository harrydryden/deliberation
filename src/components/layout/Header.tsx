import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { LogOut, User, MessageSquare, Settings, Brain, Users, ArrowLeft, Map } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useServices } from "@/hooks/useServices";
export const Header = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { deliberationId } = useParams<{ deliberationId: string }>();
  const { deliberationService } = useServices();
  
  const [deliberationTitle, setDeliberationTitle] = useState<string | null>(null);
  const [participantCount, setParticipantCount] = useState<number>(0);
  
  // Check if we're on a deliberation page
  const isDeliberationPage = location.pathname.startsWith('/deliberations/');
  const isDeliberationsListPage = location.pathname === '/deliberations';
  const isAdminPage = location.pathname.startsWith('/admin');
  
  // Load deliberation info if on deliberation page
  useEffect(() => {
    if (isDeliberationPage && deliberationId) {
      const loadDeliberationInfo = async () => {
        try {
          const deliberations = await deliberationService.getDeliberations({ id: deliberationId });
          if (deliberations.length > 0) {
            setDeliberationTitle(deliberations[0].title);
            setParticipantCount(deliberations[0].participant_count || 0);
          }
        } catch (error) {
          console.error('Failed to load deliberation info for header:', error);
        }
      };
      loadDeliberationInfo();
    } else {
      setDeliberationTitle(null);
      setParticipantCount(0);
    }
  }, [isDeliberationPage, deliberationId, deliberationService]);

  return (
    <header className="border-b bg-background backdrop-blur supports-[backdrop-filter]:bg-background/60" style={{
      position: 'sticky',
      top: 0,
      zIndex: 50,
      backgroundColor: 'hsl(var(--background) / 0.95)'
    }}>
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {/* Logo/Title */}
          <h1 className="text-xl font-bold text-democratic-blue cursor-pointer" onClick={() => navigate('/')}>
            Deliberation
          </h1>
          
          {/* Deliberation-specific context */}
          {isDeliberationPage && deliberationTitle && (
            <>
              <div className="text-muted-foreground">|</div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/deliberations')}
                  className="flex items-center space-x-1 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back</span>
                </Button>
                <div>
                  <span className="font-medium text-foreground">{deliberationTitle}</span>
                  <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    <span>{participantCount} participants</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        
        {/* Right side navigation */}
        {user && (
          <div className="flex items-center space-x-4">
            {/* Navigation based on context */}
            {!isDeliberationPage && !isDeliberationsListPage && !isAdminPage && user.role !== 'admin' && (
              <Button variant="ghost" size="sm" onClick={() => navigate('/deliberations')} className="flex items-center space-x-1">
                <MessageSquare className="h-4 w-4" />
                <span>Deliberations</span>
              </Button>
            )}
            
            {(isDeliberationPage || isDeliberationsListPage) && user.role !== 'admin' && (
              <Button variant="ghost" size="sm" onClick={() => navigate('/deliberations')} className="flex items-center space-x-1">
                <MessageSquare className="h-4 w-4" />
                <span>All Deliberations</span>
              </Button>
            )}
            
            {user.role === 'admin' && !isAdminPage && (
              <Button variant="ghost" size="sm" onClick={() => navigate('/admin')} className="flex items-center space-x-1">
                <Settings className="h-4 w-4" />
                <span>Admin</span>
              </Button>
            )}
            
            {/* User info */}
            <div className="flex items-center space-x-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs bg-democratic-blue/10 text-democratic-blue">
                  {user.profile?.displayName?.charAt(0) || user.role?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium hidden sm:inline">
                {user.profile?.displayName || (user.role === 'admin' ? 'Administrator' : 'User')}
              </span>
            </div>
            
            {/* Sign out */}
            <Button variant="outline" size="sm" onClick={logout} className="flex items-center space-x-1">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
};