import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface AdminTabNavigationProps {
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

export const AdminTabNavigation = ({ 
  defaultValue = "users",
  onValueChange 
}: AdminTabNavigationProps) => {
  return (
    <div className="sticky top-28 z-30 bg-deliberation-bg/95 backdrop-blur-sm py-2 -mx-6 px-6 border-b border-border/50">
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="users">Users</TabsTrigger>
        <TabsTrigger value="agents">Agents</TabsTrigger>
        <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
        <TabsTrigger value="deliberations">Deliberations</TabsTrigger>
        <TabsTrigger value="ratings">Agent Ratings</TabsTrigger>
      </TabsList>
    </div>
  );
};