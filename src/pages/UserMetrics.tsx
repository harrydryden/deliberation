import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { UserMetricsDashboard } from "@/components/ui/UserMetricsDashboard";
import { Navigate } from "react-router-dom";

const UserMetrics = () => {
  const { user, isLoading } = useSupabaseAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="container mx-auto py-6">
      <UserMetricsDashboard />
    </div>
  );
};

export default UserMetrics;