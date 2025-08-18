import { BulkUserCreation } from '@/components/admin/BulkUserCreation';

export const SetupPage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary/20">
      <div className="w-full max-w-2xl px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">System Setup</h1>
          <p className="text-muted-foreground">Create initial admin and user accounts</p>
        </div>
        <BulkUserCreation onUsersCreated={() => {}} />
      </div>
    </div>
  );
};