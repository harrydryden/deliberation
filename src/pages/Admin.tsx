import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useBackendAuth } from "@/hooks/useBackendAuth";
import { Layout } from "@/components/layout/Layout";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

const Admin = () => {
  const { user, isLoading } = useBackendAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/auth");
    }
  }, [user, isLoading, navigate]);

  if (isLoading) return null;
  if (!user) return null;

  return (
    <Layout>
      <div className="container mx-auto p-6">
        <AdminDashboard />
      </div>
    </Layout>
  );
};

export default Admin;