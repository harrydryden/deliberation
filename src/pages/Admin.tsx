import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthService } from "@/hooks/useServices";
import { Layout } from "@/components/layout/Layout";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

const Admin = () => {
  const authService = useAuthService();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/auth");
    } else if (!isLoading && user && user.role !== 'admin') {
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