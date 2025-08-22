import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Plus, X } from 'lucide-react';

interface GoalsInputProps {
  goals: string[];
  onGoalsChange: (goals: string[]) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

export const GoalsInput = ({ 
  goals, 
  onGoalsChange, 
  label = "Goals",
  placeholder = "Add a goal",
  disabled = false 
}: GoalsInputProps) => {
  const [goalInput, setGoalInput] = useState('');

  const handleAddGoal = () => {
    if (goalInput.trim() && !disabled) {
      onGoalsChange([...goals, goalInput.trim()]);
      setGoalInput('');
    }
  };

  const handleRemoveGoal = (index: number) => {
    if (!disabled) {
      onGoalsChange(goals.filter((_, i) => i !== index));
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddGoal();
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={goalInput}
          onChange={(e) => setGoalInput(e.target.value)}
          placeholder={placeholder}
          onKeyPress={handleKeyPress}
          disabled={disabled}
        />
        <Button 
          type="button" 
          onClick={handleAddGoal} 
          size="sm"
          disabled={disabled}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {goals.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {goals.map((goal, index) => (
            <Badge key={index} variant="secondary" className="flex items-center gap-1">
              {goal}
              {!disabled && (
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => handleRemoveGoal(index)}
                />
              )}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};