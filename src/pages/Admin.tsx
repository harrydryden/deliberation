import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { Layout } from "@/components/layout/Layout";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

const Admin = () => {
  const { user, isLoading, isAdmin } = useSupabaseAuth();
  const navigate = useNavigate();

  useEffect(() => {
    console.log('Admin page: Auth state:', { user: user?.id, isLoading, isAdmin });
    
    if (!isLoading && !user) {
      console.log('Admin page: No user, redirecting to auth');
      navigate("/auth");
    } else if (!isLoading && user && !isAdmin) {
      console.log('Admin page: User exists but not admin, redirecting to home');
      navigate("/");
    }
  }, [user, isLoading, isAdmin, navigate]);

  if (isLoading) return null;
  if (!user) return null;
  if (!isAdmin) return null;

  return (
    <Layout>
      <div className="container mx-auto p-6">
        <AdminDashboard />
      </div>
    </Layout>
  );
};

export default Admin;