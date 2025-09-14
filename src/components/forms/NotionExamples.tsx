import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lightbulb } from 'lucide-react';

interface NotionExamplesProps {
  onSelectExample: (notion: string) => void;
}

export const NotionExamples = ({ onSelectExample }: NotionExamplesProps) => {
  const examples = [
    {
      category: "Healthcare",
      notion: "Assisted dying should be legalized for terminally ill patients",
      description: "Clear stance on medical ethics with specific criteria"
    },
    {
      category: "Environment", 
      notion: "Single-use plastics must be banned to protect marine ecosystems",
      description: "Direct policy position with environmental justification"
    },
    {
      category: "Technology",
      notion: "AI systems ought to be regulated before widespread deployment",
      description: "Precautionary stance on emerging technology"
    },
    {
      category: "Education",
      notion: "University education should be free for all students",
      description: "Economic policy position on educational access"
    },
    {
      category: "Urban Planning",
      notion: "Cities need to prioritize cycling infrastructure over car parking",
      description: "Transportation policy with clear trade-offs"
    }
  ];

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Lightbulb className="h-4 w-4" />
          Notion Examples
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Good notions are specific, measurable, and contain stance language (should, must, ought).
        </p>
        {examples.map((example, index) => (
          <div key={index} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-primary">{example.category}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSelectExample(example.notion)}
                className="h-6 text-xs"
              >
                Use This
              </Button>
            </div>
            <p className="text-sm font-medium">{example.notion}</p>
            <p className="text-xs text-muted-foreground">{example.description}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};