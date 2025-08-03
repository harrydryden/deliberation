import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBackendAuth } from "@/hooks/useBackendAuth";
import { AuthForm } from "@/components/auth/AuthForm";
import { useDeliberationService } from "@/hooks/useDeliberationService";

const Auth = () => {
  const { user, isLoading } = useBackendAuth();
  const navigate = useNavigate();
  const deliberationService = useDeliberationService();
  const [deliberations, setDeliberations] = useState<any[]>([]);

  useEffect(() => {
    if (!isLoading && user) {
      console.log('✅ User authenticated, loading deliberations:', user);
      loadDeliberations();
    }
  }, [user, isLoading]);

  const loadDeliberations = async () => {
    try {
      console.log('👤 User role:', user?.role);
      
      // Check if user is admin and redirect accordingly
      if (user?.role === 'admin') {
        console.log('✅ Admin user detected, redirecting to admin dashboard');
        navigate('/admin');
        return;
      }
      
      const data = await deliberationService.getDeliberations();
      setDeliberations(data);
      
      if (data.length > 0) {
        // Find most recent active deliberation, or fallback to most recent
        const mostRecentDeliberation = data.find(d => d.status === 'active') || data[0];
        console.log('✅ Redirecting to most recent deliberation:', mostRecentDeliberation.id);
        navigate(`/deliberations/${mostRecentDeliberation.id}`);
      } else {
        // No deliberations available, redirect to deliberations page
        console.log('✅ No deliberations found, redirecting to deliberations page');
        navigate("/deliberations");
      }
    } catch (error) {
      console.error('Failed to load deliberations:', error);
      // Check if user is admin even if deliberations fail to load
      if (user?.role === 'admin') {
        console.log('✅ Admin user detected (fallback), redirecting to admin dashboard');
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
    const destinationText = user.role === 'admin' ? 'admin dashboard' : 'deliberations';
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Redirecting to {destinationText}...</div>
      </div>
    );
  }

  return <AuthForm />;
};

export default Auth;