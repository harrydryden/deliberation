import { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface BaseFieldProps {
  label?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

interface InputFieldProps extends BaseFieldProps {
  type: 'input';
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  inputType?: string;
  helpText?: string;
}

interface TextareaFieldProps extends BaseFieldProps {
  type: 'textarea';
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}

interface SelectFieldProps extends BaseFieldProps {
  type: 'select';
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  options: { value: string; label: string }[];
}

interface SwitchFieldProps extends BaseFieldProps {
  type: 'switch';
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}

type FormFieldProps = InputFieldProps | TextareaFieldProps | SelectFieldProps | SwitchFieldProps;

export const FormField = (props: FormFieldProps) => {
  const { label, error, required, disabled, className } = props;

  const renderField = () => {
    switch (props.type) {
      case 'input':
        return (
          <div>
            <Input
              value={props.value}
              onChange={(e) => props.onChange(e.target.value)}
              placeholder={props.placeholder}
              disabled={disabled}
              type={props.inputType || 'text'}
              min={props.min}
              max={props.max}
              className={error ? 'border-destructive' : ''}
            />
            {props.helpText && (
              <p className="text-xs text-muted-foreground mt-1">{props.helpText}</p>
            )}
          </div>
        );

      case 'textarea':
        return (
          <Textarea
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
            placeholder={props.placeholder}
            rows={props.rows}
            disabled={disabled}
            className={error ? 'border-red-500' : ''}
          />
        );

      case 'select':
        return (
          <Select 
            value={props.value} 
            onValueChange={props.onChange}
            disabled={disabled}
          >
            <SelectTrigger className={error ? 'border-red-500' : ''}>
              <SelectValue placeholder={props.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {props.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'switch':
        return (
          <div className="flex items-center space-x-2">
            <Switch
              checked={props.checked}
              onCheckedChange={props.onChange}
              disabled={disabled}
            />
            {props.description && (
              <span className="text-sm text-muted-foreground">
                {props.description}
              </span>
            )}
          </div>
        );
    }
  };

  return (
    <div className={`space-y-2 ${className || ''}`}>
      {label && (
        <Label className={required ? "after:content-['*'] after:ml-0.5 after:text-red-500" : ''}>
          {label}
        </Label>
      )}
      {renderField()}
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
    </div>
  );
};