import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

export interface PromptTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  templateText: string;
  variables?: Record<string, unknown>;
  isActive: boolean;
  version: number;
  createdBy?: string;
  deliberationId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PromptVariable {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  defaultValue?: unknown;
}

export class PromptService {
  /**
   * Get prompt templates, optionally filtered by category
   */
  async getPromptTemplates(category?: string): Promise<PromptTemplate[]> {
    try {
      let query = supabase
        .from('prompt_templates')
        .select('*')
        .eq('is_active', true);

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (error) {
        logger.error('[PromptService] Error getting prompt templates', { error, category });
        throw new Error(`Failed to get prompt templates: ${error.message}`);
      }

      return (data || []).map(this.mapDatabaseToPromptTemplate);
    } catch (error) {
      logger.error('[PromptService] Unexpected error getting prompt templates', { error, category });
      throw error;
    }
  }
  /**
   * Get a prompt template by name
   */
  async getPromptTemplate(templateName: string): Promise<PromptTemplate | null> {
    try {
      const { data, error } = await supabase
        .from('prompt_templates')
        .select('*')
        .eq('name', templateName)
        .eq('is_active', true)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        logger.error('[PromptService] Error getting prompt template', { error, templateName });
        throw new Error(`Failed to get prompt template: ${error.message}`);
      }

      if (!data) return null;

      return this.mapDatabaseToPromptTemplate(data);
    } catch (error) {
      logger.error('[PromptService] Unexpected error getting prompt template', { error, templateName });
      throw error;
    }
  }

  /**
   * Get all prompt templates for a category
   */
  async getPromptTemplatesByCategory(category: string): Promise<PromptTemplate[]> {
    try {
      const { data, error } = await supabase
        .from('prompt_templates')
        .select('*')
        .eq('category', category)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) {
        logger.error('[PromptService] Error getting prompt templates by category', { error, category });
        throw new Error(`Failed to get prompt templates: ${error.message}`);
      }

      return data.map(this.mapDatabaseToPromptTemplate);
    } catch (error) {
      logger.error('[PromptService] Unexpected error getting prompt templates by category', { error, category });
      throw error;
    }
  }

  /**
   * Get all prompt templates
   */
  async getAllPromptTemplates(): Promise<PromptTemplate[]> {
    try {
      const { data, error } = await supabase
        .from('prompt_templates')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (error) {
        logger.error('[PromptService] Error getting all prompt templates', { error });
        throw new Error(`Failed to get all prompt templates: ${error.message}`);
      }

      return data.map(this.mapDatabaseToPromptTemplate);
    } catch (error) {
      logger.error('[PromptService] Unexpected error getting all prompt templates', { error });
      throw error;
    }
  }

  /**
   * Create a new prompt template
   */
  async createPromptTemplate(template: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<PromptTemplate> {
    try {
      const { data, error } = await supabase
        .from('prompt_templates')
        .insert({
          name: template.name,
          description: template.description,
          category: template.category,
          template_text: template.templateText,
          variables: template.variables,
          is_active: template.isActive,
          version: template.version,
          created_by: template.createdBy,
          deliberation_id: template.deliberationId,
          metadata: template.metadata,
        })
        .select()
        .single();

      if (error) {
        logger.error('[PromptService] Error creating prompt template', { error, template });
        throw new Error(`Failed to create prompt template: ${error.message}`);
      }

      return this.mapDatabaseToPromptTemplate(data);
    } catch (error) {
      logger.error('[PromptService] Unexpected error creating prompt template', { error, template });
      throw error;
    }
  }

  /**
   * Update an existing prompt template
   */
  async updatePromptTemplate(
    id: string, 
    updates: Partial<Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<PromptTemplate> {
    try {
      const updateData: Record<string, unknown> = {};
      
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.category !== undefined) updateData.category = updates.category;
      if (updates.templateText !== undefined) updateData.template_text = updates.templateText;
      if (updates.variables !== undefined) updateData.variables = updates.variables;
      if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
      if (updates.version !== undefined) updateData.version = updates.version;
      if (updates.metadata !== undefined) updateData.metadata = updates.metadata;

      const { data, error } = await supabase
        .from('prompt_templates')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('[PromptService] Error updating prompt template', { error, id, updates });
        throw new Error(`Failed to update prompt template: ${error.message}`);
      }

      return this.mapDatabaseToPromptTemplate(data);
    } catch (error) {
      logger.error('[PromptService] Unexpected error updating prompt template', { error, id, updates });
      throw error;
    }
  }

  /**
   * Delete a prompt template
   */
  async deletePromptTemplate(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('prompt_templates')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('[PromptService] Error deleting prompt template', { error, id });
        throw new Error(`Failed to delete prompt template: ${error.message}`);
      }
    } catch (error) {
      logger.error('[PromptService] Unexpected error deleting prompt template', { error, id });
      throw error;
    }
  }

  /**
   * Render a prompt template with variables
   */
  renderPrompt(template: PromptTemplate, variables: Record<string, string>): string {
    let renderedPrompt = template.templateText;

    // Replace variables in the template
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      renderedPrompt = renderedPrompt.replace(new RegExp(placeholder, 'g'), value);
    }

    return renderedPrompt;
  }


  /**
   * Get the issue recommendation prompt
   */
  async getIssueRecommendationPrompt(): Promise<PromptTemplate | null> {
    return this.getPromptTemplate('Issue Recommendation System');
  }

  /**
   * Validate prompt template variables
   */
  validatePromptVariables(template: PromptTemplate, variables: Record<string, string>): string[] {
    const errors: string[] = [];
    
    if (!template.variables) return errors;

    // Check for required variables
    for (const [varName, varConfig] of Object.entries(template.variables)) {
      const config = varConfig as PromptVariable;
      if (config.required && !variables[varName]) {
        errors.push(`Required variable '${varName}' is missing`);
      }
    }

    // Check for extra variables
    for (const varName of Object.keys(variables)) {
      if (!template.variables[varName]) {
        errors.push(`Unknown variable '${varName}'`);
      }
    }

    return errors;
  }

  /**
   * Map database record to PromptTemplate interface
   */
  private mapDatabaseToPromptTemplate(data: Record<string, unknown>): PromptTemplate {
    return {
      id: data.id as string,
      name: data.name as string,
      description: data.description as string | undefined,
      category: data.category as string,
      templateText: data.template_text as string,
      variables: data.variables as Record<string, unknown> | undefined,
      isActive: data.is_active as boolean,
      version: data.version as number,
      createdBy: data.created_by as string | undefined,
      deliberationId: data.deliberation_id as string | undefined,
      metadata: data.metadata as Record<string, unknown> | undefined,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
    };
  }
}

export const promptService = new PromptService();