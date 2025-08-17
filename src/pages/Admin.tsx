import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout/Layout";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

const Admin = () => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    console.log('Admin page - user state:', { user, isLoading, role: user?.role });
    if (!isLoading && !user) {
      console.log('Admin page - redirecting to auth (no user)');
      navigate("/auth");
    } else if (!isLoading && user && user.role !== 'admin') {
      console.log('Admin page - redirecting to home (not admin):', user.role);
      navigate("/");
    }
  }, [user, isLoading, navigate]);

  if (isLoading) return null;
  if (!user) return null;
  if (user.role !== 'admin') return null;

  return (
    <Layout>
      <div className="container mx-auto p-6">
        <AdminDashboard />
      </div>
    </Layout>
  );
};

export default Admin;