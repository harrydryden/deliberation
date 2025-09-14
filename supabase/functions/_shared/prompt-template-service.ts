export class PromptTemplateService {
  private supabase: any;

  constructor(supabase: any) {
    this.supabase = supabase;
  }

  async generatePrompt(
    templateName: string,
    variables: Record<string, any> = {},
    fallbackPrompt?: string
  ): Promise<{ prompt: string; isTemplate: boolean }> {
    // Return fallback prompt or empty string to maintain compatibility
    return {
      prompt: fallbackPrompt || '',
      isTemplate: false
    };
  }

  async logTemplateUsage(
    templateName: string,
    isTemplate: boolean,
    context: string
  ): Promise<void> {
    // No-op implementation to maintain compatibility
  }
}