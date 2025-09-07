import { useState, useCallback } from 'react';
import { logger } from '@/utils/logger';

export interface UseFormOptions<T> {
  initialData: T;
  onSubmit?: (data: T) => void | Promise<void>;
  validate?: (data: T) => Record<string, string> | null;
}

export const useForm = <T extends Record<string, any>>({
  initialData,
  onSubmit,
  validate
}: UseFormOptions<T>) => {
  const [formData, setFormData] = useState<T>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = useCallback(<K extends keyof T>(
    field: K,
    value: T[K]
  ) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error when field is updated
    if (errors[field as string]) {
      setErrors(prev => ({
        ...prev,
        [field as string]: ''
      }));
    }
  }, [errors]);

  const updateFields = useCallback((updates: Partial<T>) => {
    setFormData(prev => ({
      ...prev,
      ...updates
    }));
  }, []);

  const resetForm = useCallback((data?: T) => {
    setFormData(data || initialData);
    setErrors({});
  }, [initialData]);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    if (validate) {
      const validationErrors = validate(formData);
      if (validationErrors) {
        setErrors(validationErrors);
        return false;
      }
    }

    if (onSubmit) {
      setIsSubmitting(true);
      try {
        await onSubmit(formData);
        return true;
      } catch (error) {
        logger.error('Form submission error', { error });
        return false;
      } finally {
        setIsSubmitting(false);
      }
    }
    
    return true;
  }, [formData, validate, onSubmit]);

  const getFieldProps = useCallback(<K extends keyof T>(field: K) => ({
    value: formData[field],
    onChange: (value: T[K]) => updateField(field, value),
    error: errors[field as string]
  }), [formData, errors, updateField]);

  return {
    formData,
    errors,
    isSubmitting,
    updateField,
    updateFields,
    resetForm,
    handleSubmit,
    getFieldProps,
    setErrors
  };
};