import { Agent } from '@/types/index';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, Settings } from 'lucide-react';
import { useServices } from '@/hooks/useServices';

interface SystemPromptPreviewProps {
  agent: Agent;
}

export const SystemPromptPreview = ({ agent }: SystemPromptPreviewProps) => {
  const { agentService } = useServices();
  
  const systemPrompt = agentService.generatePromptPreview(agent);
  const hasOverride = Boolean(agent.prompt_overrides?.system_prompt);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Bot className="h-4 w-4" />
          System Prompt Preview
          {hasOverride && (
            <Badge variant="secondary" className="text-xs">
              <Settings className="h-3 w-3 mr-1" />
              Custom Override
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            {hasOverride 
              ? 'Custom system prompt override:'
              : 'Auto-generated from agent configuration:'}
          </div>
          <div className="bg-muted p-3 rounded-md font-mono text-sm">
            {systemPrompt}
          </div>
          {!hasOverride && (
            <div className="text-xs text-muted-foreground">
              Generated from: {agent.name}
              {agent.description && ` • ${agent.description}`}
              {agent.goals?.length && ` • ${agent.goals.length} goals`}
              {agent.response_style && ` • ${agent.response_style} style`}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};