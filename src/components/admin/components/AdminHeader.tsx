interface AdminHeaderProps {
  title?: string;
  description?: string;
}

export const AdminHeader = ({ 
  title = "Admin Dashboard",
  description = "Manage users, agents, and deliberations"
}: AdminHeaderProps) => {
  return (
    <div className="sticky top-16 z-40 bg-deliberation-bg/95 backdrop-blur-sm py-4 -mx-6 px-6 mb-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
};