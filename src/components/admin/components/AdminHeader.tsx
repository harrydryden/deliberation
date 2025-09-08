interface AdminHeaderProps {
  title?: string;
  description?: string;
}

export const AdminHeader = ({ 
  title = "Admin Dashboard",
  description = "Manage users, agents, and deliberations"
}: AdminHeaderProps) => {
  return (
    <div className="py-4 mb-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
};