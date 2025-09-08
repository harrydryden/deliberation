import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

const Admin = () => {
  const { user, isLoading, isAdmin } = useSupabaseAuth();
  const navigate = useNavigate();

  useEffect(() => {
  
    
    if (!isLoading && !user) {

      navigate("/auth");
    } else if (!isLoading && user && !isAdmin) {
      
      navigate("/");
    }
  }, [user, isLoading, isAdmin, navigate]);

  if (isLoading) return null;
  if (!user) return null;
  if (!isAdmin) return null;

  return (
    <div className="container mx-auto p-6">
      <AdminDashboard />
    </div>
  );
};

export default Admin;