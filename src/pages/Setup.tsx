import { CreateAdminUsers } from '@/components/admin/CreateAdminUsers';

export const SetupPage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary/20">
      <div className="w-full max-w-md">
        <CreateAdminUsers />
      </div>
    </div>
  );
};