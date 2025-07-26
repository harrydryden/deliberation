import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useBackend } from "@/contexts/BackendContext";
import { Badge } from "@/components/ui/badge";

export const BackendToggle = () => {
  const { useNodeBackend, toggleBackend } = useBackend();

  return (
    <div className="flex items-center space-x-3">
      <div className="flex items-center space-x-2">
        <Switch
          id="backend-toggle"
          checked={useNodeBackend}
          onCheckedChange={toggleBackend}
        />
        <Label htmlFor="backend-toggle" className="text-sm font-medium">
          Node.js Backend
        </Label>
      </div>
      <Badge variant={useNodeBackend ? "default" : "secondary"}>
        {useNodeBackend ? "Node.js" : "Supabase"}
      </Badge>
    </div>
  );
};