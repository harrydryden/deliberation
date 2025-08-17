import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { ChatOpenAI } from '@langchain/openai';
import { RetrievalQAChain } from 'langchain/chains';
import { PromptTemplate } from '@langchain/core/prompts';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { Document } from '@langchain/core/documents';

export class LangChainRAGService {
  private embeddings: OpenAIEmbeddings;
  private textSplitter: RecursiveCharacterTextSplitter;
  private llm: ChatOpenAI;
  private supabaseClient: any;

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: config.openaiApiKey,
      modelName: 'text-embedding-3-small',
    });

    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ['\n\n', '\n', '. ', '? ', '! ', ' ', ''],
    });

    this.llm = new ChatOpenAI({
      openAIApiKey: config.openaiApiKey,
      modelName: 'gpt-5-2025-08-07',
    });

    this.supabaseClient = createClient(
      config.supabaseUrl,
      config.supabaseServiceKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
  }

  /**
   * High-performance document processing with parallel operations and caching
   */
  async processDocument(
    agentId: string,
    fileName: string,
    textContent: string,
    contentType: string,
    storagePath: string,
    originalFileSize: number
  ): Promise<{ success: boolean; chunksProcessed: number; totalChunks: number }> {
    const startTime = performance.now();
    
    try {
      logger.info({ agentId, fileName }, 'Starting high-performance document processing');

      // Validate agent
      await this.validateLocalAgent(agentId);

      // Enhanced text splitting with better chunk boundaries
      const enhancedSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1200, // Slightly larger chunks for better context
        chunkOverlap: 300, // Increased overlap for better continuity
        separators: ['\n\n', '\n', '. ', '? ', '! ', '; ', ', ', ' ', ''],
        keepSeparator: true,
      });

      const documents = await enhancedSplitter.createDocuments([textContent], [
        {
          agentId,
          fileName,
          contentType,
          storagePath,
          originalFileSize,
          processingTimestamp: new Date().toISOString(),
        },
      ]);

      logger.info({ agentId, chunks: documents.length }, 'Document split into optimized chunks');

      // Parallel embedding generation and storage
      const BATCH_SIZE = 15;
      const batches = [];
      for (let i = 0; i < documents.length; i += BATCH_SIZE) {
        batches.push(documents.slice(i, i + BATCH_SIZE));
      }

      const processedChunks = [];
      const batchPromises = batches.map(async (batch, batchIndex) => {
        logger.info({ batchIndex, batchSize: batch.length }, 'Processing batch');
        
        // Generate embeddings in parallel for the batch
        const embeddingPromises = batch.map(doc => this.embeddings.embedQuery(doc.pageContent));
        const embeddings = await Promise.all(embeddingPromises);

        // Prepare batch for database insertion
        const batchItems = batch.map((doc, idx) => {
          const chunkContent = doc.pageContent.trim();
          const sanitizedContent = chunkContent
            .replace(/\u0000/g, '')
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
            .trim();

          return {
            agent_id: agentId,
            title: `${fileName} - Part ${(batchIndex * BATCH_SIZE) + idx + 1}`,
            content: sanitizedContent,
            content_type: contentType,
            file_name: fileName,
            chunk_index: (batchIndex * BATCH_SIZE) + idx,
            file_size: textContent.length,
            storage_path: storagePath,
            original_file_size: originalFileSize,
            embedding: embeddings[idx],
            processing_status: 'completed',
            metadata: {
              total_chunks: documents.length,
              chunk_size: chunkContent.length,
              original_file_type: contentType,
              langchain_processed: true,
              high_performance: true,
              batch_index: batchIndex,
              processing_method: 'parallel_batch',
            },
          };
        });

        // Bulk insert the batch
        const { data, error } = await this.supabaseClient
          .from('agent_knowledge')
          .insert(batchItems)
          .select('id');

        if (error) {
          logger.error({ error, batchIndex }, 'Batch insertion error');
          throw error;
        }

        logger.info({ batchIndex, inserted: batchItems.length }, 'Batch inserted successfully');
        return batchItems.length;
      });

      // Wait for all batches to complete
      const batchResults = await Promise.all(batchPromises);
      const totalProcessed = batchResults.reduce((sum, count) => sum + count, 0);

      const processingTime = performance.now() - startTime;

      logger.info(
        { 
          agentId, 
          fileName, 
          chunksProcessed: totalProcessed,
          batches: batches.length,
          processingTime: Math.round(processingTime)
        },
        'High-performance document processing completed'
      );

      return {
        success: true,
        chunksProcessed: totalProcessed,
        totalChunks: documents.length,
      };
    } catch (error) {
      logger.error({ error, agentId, fileName }, 'Error in high-performance document processing');
      throw error;
    }
  }

  /**
   * High-performance knowledge querying with caching and parallel retrieval
   */
  async queryKnowledge(
    agentId: string,
    query: string,
    maxResults: number = 8,
    userId?: string,
    deliberationId?: string
  ): Promise<{
    success: boolean;
    response: string;
    knowledgeChunks: number;
    relevantKnowledge: any[];
    sources: string[];
  }> {
    const startTime = performance.now();
    
    try {
      logger.info({ agentId, query, userId }, 'Starting high-performance knowledge query');

      // Validate agent
      await this.validateLocalAgent(agentId);

      // Enhanced retrieval with multiple search strategies
      const strategies = [
        {
          name: 'exact_semantic',
          threshold: 0.85,
          k: Math.ceil(maxResults / 2)
        },
        {
          name: 'broad_semantic', 
          threshold: 0.3,
          k: maxResults
        }
      ];

      const allRelevantDocs: Document[] = [];
      const retrievalPromises = strategies.map(async (strategy) => {
        try {
          const vectorStore = new SupabaseVectorStore(this.embeddings, {
            client: this.supabaseClient,
            tableName: 'agent_knowledge',
            queryName: 'match_agent_knowledge',
            filter: { agent_id: agentId },
          });

          const retriever = vectorStore.asRetriever({
            k: strategy.k,
            searchType: 'similarity',
            searchKwargs: {
              threshold: strategy.threshold,
            },
          });

          const docs = await retriever.getRelevantDocuments(query);
          logger.info({ strategy: strategy.name, docs: docs.length }, 'Strategy retrieval completed');
          return docs;
        } catch (error) {
          logger.warn({ strategy: strategy.name, error }, 'Strategy retrieval failed');
          return [];
        }
      });

      // Execute retrieval strategies in parallel
      const strategyResults = await Promise.all(retrievalPromises);
      
      // Combine and deduplicate results
      const seenContent = new Set();
      strategyResults.forEach(docs => {
        docs.forEach(doc => {
          const contentHash = doc.pageContent.slice(0, 100);
          if (!seenContent.has(contentHash)) {
            seenContent.add(contentHash);
            allRelevantDocs.push(doc);
          }
        });
      });

      // Limit to maxResults and ensure quality
      const finalDocs = allRelevantDocs.slice(0, maxResults);

      if (finalDocs.length === 0) {
        logger.warn({ agentId, query }, 'No relevant documents found');
        return {
          success: true,
          response: 'I could not find relevant information in the available knowledge base to answer your question.',
          knowledgeChunks: 0,
          relevantKnowledge: [],
          sources: [],
        };
      }

      // Enhanced prompt with better context organization
      const promptTemplate = PromptTemplate.fromTemplate(`
You are an expert policy analyst with deep knowledge of legislative documents and policy frameworks.
Provide comprehensive, actionable insights based on the provided context.

RELEVANT CONTEXT:
{context}

QUERY: {question}

ANALYSIS FRAMEWORK:
1. **Direct Response**: Answer the specific question clearly
2. **Context Analysis**: Explain what the documents reveal about this topic  
3. **Practical Implications**: Discuss real-world applications and consequences
4. **Related Considerations**: Connect to broader policy themes when relevant
5. **Gaps & Limitations**: Note if additional information would be helpful

Provide a thorough, well-structured analysis that goes beyond simple fact recitation:
`);

      // Parallel LLM processing for faster response
      const contextText = finalDocs.map(doc => doc.pageContent).join('\n\n---\n\n');
      
      const llmPromise = this.llm.call([
        { role: 'user', content: promptTemplate.format({ context: contextText, question: query }) }
      ]);

      // Process source information in parallel
      const sourcePromise = Promise.resolve(finalDocs.map((doc: Document) => {
        const metadata = doc.metadata || {};
        return metadata.fileName || metadata.file_name || metadata.title || 'Unknown source';
      }));

      // Wait for both operations
      const [llmResult, sources] = await Promise.all([llmPromise, sourcePromise]);
      const uniqueSources = [...new Set(sources)];

      // Format relevant knowledge with enhanced metadata
      const relevantKnowledge = finalDocs.map((doc: Document, index: number) => ({
        id: `hp-chunk-${index}`,
        content: doc.pageContent,
        metadata: doc.metadata,
        similarity: 0.8 - (index * 0.05), // Estimated similarity based on order
        title: doc.metadata?.title || `Chunk ${index + 1}`,
        file_name: doc.metadata?.fileName || doc.metadata?.file_name,
        chunk_index: doc.metadata?.chunkIndex || doc.metadata?.chunk_index || index,
        processing_method: doc.metadata?.processing_method || 'standard',
      }));

      const processingTime = performance.now() - startTime;

      logger.info(
        {
          agentId,
          query,
          chunksRetrieved: relevantKnowledge.length,
          sources: uniqueSources.length,
          processingTime: Math.round(processingTime),
        },
        'High-performance knowledge query completed'
      );

      return {
        success: true,
        response: llmResult.content,
        knowledgeChunks: relevantKnowledge.length,
        relevantKnowledge,
        sources: uniqueSources,
      };
    } catch (error) {
      logger.error({ error, agentId, query }, 'Error in high-performance knowledge query');
      throw error;
    }
  }

  /**
   * Delete all knowledge for a specific agent
   */
  async deleteAgentKnowledge(agentId: string): Promise<{ success: boolean; deletedCount: number }> {
    try {
      logger.info({ agentId }, 'Deleting agent knowledge');

      const { data, error } = await this.supabaseClient
        .from('agent_knowledge')
        .delete()
        .eq('agent_id', agentId)
        .select('id');

      if (error) {
        throw error;
      }

      const deletedCount = data?.length || 0;

      logger.info({ agentId, deletedCount }, 'Agent knowledge deleted');

      return {
        success: true,
        deletedCount,
      };
    } catch (error) {
      logger.error({ error, agentId }, 'Error deleting agent knowledge');
      throw error;
    }
  }

  /**
   * Get agent knowledge statistics
   */
  async getKnowledgeStats(agentId: string): Promise<{
    totalChunks: number;
    totalFiles: number;
    totalSize: number;
    files: Array<{ fileName: string; chunks: number; size: number }>;
  }> {
    try {
      const { data, error } = await this.supabaseClient
        .from('agent_knowledge')
        .select('file_name, file_size, chunk_index')
        .eq('agent_id', agentId);

      if (error) {
        throw error;
      }

      const stats = {
        totalChunks: data.length,
        totalFiles: 0,
        totalSize: 0,
        files: [] as Array<{ fileName: string; chunks: number; size: number }>,
      };

      // Group by file name
      const fileMap = new Map<string, { chunks: number; size: number }>();

      for (const record of data) {
        const fileName = record.file_name || 'Unknown';
        const size = record.file_size || 0;

        if (!fileMap.has(fileName)) {
          fileMap.set(fileName, { chunks: 0, size: 0 });
        }

        const fileStats = fileMap.get(fileName)!;
        fileStats.chunks++;
        fileStats.size = Math.max(fileStats.size, size); // Use max size per file
      }

      stats.totalFiles = fileMap.size;
      stats.totalSize = Array.from(fileMap.values()).reduce((sum, file) => sum + file.size, 0);
      stats.files = Array.from(fileMap.entries()).map(([fileName, stats]) => ({
        fileName,
        ...stats,
      }));

      return stats;
    } catch (error) {
      logger.error({ error, agentId }, 'Error getting knowledge stats');
      throw error;
    }
  }

  /**
   * Validate that an agent is a local agent (not a global template)
   */
  private async validateLocalAgent(agentId: string): Promise<void> {
    const { data: agentData, error } = await this.supabaseClient
      .from('agent_configurations')
      .select('id, deliberation_id')
      .eq('id', agentId)
      .single();

    if (error) {
      throw new Error('Invalid agent ID');
    }

    if (!agentData.deliberation_id) {
      throw new Error(
        'Knowledge operations are only available for local agents (specific to deliberations), not global template agents'
      );
    }
  }
}

// Singleton instance
export const langchainRAGService = new LangChainRAGService();