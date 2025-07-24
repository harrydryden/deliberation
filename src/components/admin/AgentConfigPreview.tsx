import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type AgentConfig = {
  id: string;
  agent_type: string;
  name: string;
  description?: string;
  system_prompt: string;
  goals?: string[];
  response_style?: string;
  is_default: boolean;
  is_active: boolean;
};

interface AgentConfigPreviewProps {
  config: AgentConfig;
}

export const AgentConfigPreview = ({ config }: AgentConfigPreviewProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Live Preview
          <Badge variant="outline" className="text-xs">
            {config.agent_type.replace('_', ' ').toUpperCase()}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="font-semibold text-sm text-muted-foreground mb-2">Agent Name</h4>
          <p className="font-medium">{config.name}</p>
        </div>

        {config.description && (
          <div>
            <h4 className="font-semibold text-sm text-muted-foreground mb-2">Description</h4>
            <p className="text-sm">{config.description}</p>
          </div>
        )}

        <Separator />

        <div>
          <h4 className="font-semibold text-sm text-muted-foreground mb-2">System Prompt</h4>
          <div className="bg-muted p-3 rounded-md">
            <pre className="text-xs whitespace-pre-wrap break-words font-mono">
              {config.system_prompt}
            </pre>
          </div>
        </div>

        {config.goals && config.goals.length > 0 && (
          <div>
            <h4 className="font-semibold text-sm text-muted-foreground mb-2">Goals</h4>
            <ul className="space-y-1">
              {config.goals.filter(goal => goal.trim()).map((goal, index) => (
                <li key={index} className="text-sm flex items-start gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span>{goal}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {config.response_style && (
          <div>
            <h4 className="font-semibold text-sm text-muted-foreground mb-2">Response Style</h4>
            <div className="bg-muted p-3 rounded-md">
              <p className="text-xs whitespace-pre-wrap">{config.response_style}</p>
            </div>
          </div>
        )}

        <Separator />

        <div className="flex gap-2">
          <Badge variant={config.is_active ? "default" : "secondary"}>
            {config.is_active ? "Active" : "Inactive"}
          </Badge>
          <Badge variant={config.is_default ? "outline" : "secondary"}>
            {config.is_default ? "Default Configuration" : "Custom Configuration"}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
};