import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout/Layout";
import { AdminInterface } from "@/components/admin/AdminInterface";

const Admin = () => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/auth");
    }
    // Check if user has admin role
    if (!isLoading && user && user.user_metadata?.user_role !== 'admin') {
      navigate("/");
    }
  }, [user, isLoading, navigate]);

  if (isLoading) return null;
  if (!user) return null;
  if (user.user_metadata?.user_role !== 'admin') return null;

  return (
    <Layout>
      <AdminInterface />
    </Layout>
  );
};

export default Admin;