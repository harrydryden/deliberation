// ============================================================================
// SHARED PROMPT TEMPLATE SERVICE FOR EDGE FUNCTIONS
// ============================================================================

interface PromptTemplate {
  template_text: string;
  variables?: any;
  category?: string;
  version?: number;
}

interface TemplateVariable {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  default_value?: string;
}

export class PromptTemplateService {
  private supabase: any;

  constructor(supabase: any) {
    this.supabase = supabase;
  }

  /**
   * Retrieve a prompt template by name
   */
  async getPromptTemplate(templateName: string): Promise<PromptTemplate | null> {
    try {
      const { data, error } = await this.supabase
        .rpc('get_prompt_template', { template_name: templateName });

      if (error) {
        console.warn(`Failed to fetch prompt template "${templateName}":`, error);
        return null;
      }

      if (!data || data.length === 0) {
        console.warn(`Prompt template "${templateName}" not found`);
        return null;
      }

      return {
        template_text: data[0].template_text,
        variables: data[0].variables,
        category: data[0].category,
        version: data[0].version
      };
    } catch (error) {
      console.warn(`Error fetching prompt template "${templateName}":`, error);
      return null;
    }
  }

  /**
   * Substitute variables in a template with provided values
   */
  substituteTemplateVariables(templateText: string, variables: Record<string, any>): string {
    let result = templateText;

    // Replace {{variable}} patterns with actual values
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      result = result.replace(regex, String(value));
    });

    return result;
  }

  /**
   * Validate that all required variables are provided
   */
  validateRequiredVariables(templateVariables: any, providedVariables: Record<string, any>): string[] {
    const missingVariables: string[] = [];

    if (templateVariables && Array.isArray(templateVariables)) {
      templateVariables.forEach((variable: TemplateVariable) => {
        if (variable.required && !(variable.name in providedVariables)) {
          missingVariables.push(variable.name);
        }
      });
    }

    return missingVariables;
  }

  /**
   * Generate a prompt using a template with variable substitution
   */
  async generatePrompt(
    templateName: string, 
    variables: Record<string, any>,
    fallbackPrompt?: string
  ): Promise<{ prompt: string; isTemplate: boolean; templateUsed?: string }> {
    // Try to fetch and use template
    const template = await this.getPromptTemplate(templateName);
    
    if (template) {
      try {
        // Validate required variables
        const missingVariables = this.validateRequiredVariables(template.variables, variables);
        if (missingVariables.length > 0) {
          console.warn(`Missing required variables for template "${templateName}":`, missingVariables);
          if (fallbackPrompt) {
            return { prompt: fallbackPrompt, isTemplate: false };
          }
        }

        // Substitute variables in template
        const processedPrompt = this.substituteTemplateVariables(template.template_text, variables);
        
        console.log(`Successfully used template "${templateName}" (v${template.version})`);
        return { 
          prompt: processedPrompt, 
          isTemplate: true, 
          templateUsed: `${templateName} v${template.version}` 
        };

      } catch (error) {
        console.warn(`Error processing template "${templateName}":`, error);
        if (fallbackPrompt) {
          return { prompt: fallbackPrompt, isTemplate: false };
        }
      }
    }

    // Fallback to hardcoded prompt if template fails or is not found
    if (fallbackPrompt) {
      console.warn(`Using fallback prompt for "${templateName}"`);
      return { prompt: fallbackPrompt, isTemplate: false };
    }

    throw new Error(`Template "${templateName}" not found and no fallback provided`);
  }

  /**
   * Log template usage for analytics
   */
  logTemplateUsage(templateName: string, isTemplate: boolean, context: string) {
    console.log(`Template Usage - ${context}: ${templateName} (${isTemplate ? 'template' : 'fallback'})`);
  }
}