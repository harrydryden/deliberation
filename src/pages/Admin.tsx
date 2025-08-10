import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useBackendAuth } from "@/hooks/useBackendAuth";
import { Layout } from "@/components/layout/Layout";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { Button } from "@/components/ui/button";

const Admin = () => {
  const { user, isLoading } = useBackendAuth();
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
      <div className="container mx-auto p-6 space-y-4">
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => navigate('/backend')}>
            Backend Config
          </Button>
        </div>
        <AdminDashboard />
      </div>
    </Layout>
  );
};

export default Admin;