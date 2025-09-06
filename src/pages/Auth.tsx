import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { SupabaseAuthForm } from "@/components/auth/SupabaseAuthForm";
import { useDeliberationService } from "@/hooks/useDeliberationService";

const Auth = () => {

  const { user, isLoading, isAdmin } = useSupabaseAuth();
  const navigate = useNavigate();
  const deliberationService = useDeliberationService();
  const [deliberations, setDeliberations] = useState<any[]>([]);

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

  return <SupabaseAuthForm />;
};

export default Auth;