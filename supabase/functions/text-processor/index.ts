import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Import shared utilities for performance and consistency
import { 
  corsHeaders, 
  createErrorResponse, 
  createSuccessResponse,
  handleCORSPreflight,
  parseAndValidateRequest
} from '../shared/edge-function-utils.ts';

interface TextProcessingRequest {
  text: string;
  fileName: string;
  deliberationId: string;
  userId: string;
}

interface TextProcessingResult {
  success: boolean;
  text: string;
  wordCount: number;
  chunks: string[];
  keywords: string[];
  summary?: string;
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight with shared utility
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    const { text, fileName, deliberationId, userId } = await parseAndValidateRequest(req, ['text', 'fileName', 'deliberationId', 'userId']);

    // Process the text content
    const result = await processTextContent(text, fileName);

    return createSuccessResponse(result);

  } catch (error) {
    console.error('Text Processing Error:', error);
    return createErrorResponse({
      success: false,
      error: error.message,
      text: '',
      wordCount: 0,
      chunks: [],
      keywords: []
    }, 500, 'text-processor');
  }
});

async function processTextContent(text: string, fileName: string): Promise<TextProcessingResult> {
  try {
    // Clean and normalize text
    const cleanText = text.trim().replace(/\s+/g, ' ');
    
    // Count words
    const wordCount = cleanText.split(' ').length;
    
    // Split into chunks (approximately 1000 characters each)
    const chunkSize = 1000;
    const chunks: string[] = [];
    for (let i = 0; i < cleanText.length; i += chunkSize) {
      chunks.push(cleanText.slice(i, i + chunkSize));
    }
    
    // Extract basic keywords (simple implementation)
    const keywords = extractKeywords(cleanText);
    
    // Generate summary for long documents
    let summary: string | undefined;
    if (wordCount > 100) {
      summary = generateSummary(cleanText);
    }

    return {
      success: true,
      text: cleanText,
      wordCount,
      chunks,
      keywords,
      summary
    };

  } catch (error) {
    console.error('Text processing failed:', error);
    return {
      success: false,
      text: '',
      wordCount: 0,
      chunks: [],
      keywords: [],
      error: error.message
    };
  }
}

function extractKeywords(text: string): string[] {
  // Simple keyword extraction - remove common words and extract significant terms
  const commonWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'can', 'must', 'shall', 'this', 'that',
    'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them'
  ]);

  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3 && !commonWords.has(word));

  // Count frequency and return top keywords
  const frequency: { [key: string]: number } = {};
  words.forEach(word => {
    frequency[word] = (frequency[word] || 0) + 1;
  });

  return Object.entries(frequency)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([word]) => word);
}

function generateSummary(text: string): string {
  // Simple extractive summarization - take first and key sentences
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  
  if (sentences.length <= 3) {
    return sentences.join('. ') + '.';
  }
  
  // Take first sentence and middle sentences
  const summary = [
    sentences[0],
    sentences[Math.floor(sentences.length / 2)],
    sentences[sentences.length - 1]
  ].join('. ') + '.';
  
  return summary.length > 500 ? summary.substring(0, 500) + '...' : summary;
}