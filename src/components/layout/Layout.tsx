import { useAuthService } from "@/hooks/useServices";
import { Header } from "./Header";
import { Loader2 } from "lucide-react";
import { memo } from "react";

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout = memo(({ children }: LayoutProps) => {
  const authService = useAuthService();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-deliberation-bg">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-democratic-blue" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-deliberation-bg">
      <Header />
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
});