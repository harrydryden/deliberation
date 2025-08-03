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
      modelName: 'gpt-4.1-2025-04-14',
      temperature: 0.7,
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
   * Process and store document content using LangChain
   */
  async processDocument(
    agentId: string,
    fileName: string,
    textContent: string,
    contentType: string,
    storagePath: string,
    originalFileSize: number
  ): Promise<{ success: boolean; chunksProcessed: number; totalChunks: number }> {
    try {
      logger.info({ agentId, fileName }, 'Starting LangChain document processing');

      // Validate agent
      await this.validateLocalAgent(agentId);

      // Split the document into chunks using LangChain
      const documents = await this.textSplitter.createDocuments([textContent], [
        {
          agentId,
          fileName,
          contentType,
          storagePath,
          originalFileSize,
        },
      ]);

      logger.info({ agentId, chunks: documents.length }, 'Document split into chunks');

      // Create vector store for this specific agent
      const vectorStore = await SupabaseVectorStore.fromDocuments(
        documents,
        this.embeddings,
        {
          client: this.supabaseClient,
          tableName: 'agent_knowledge',
          queryName: 'match_agent_knowledge',
          filter: { agent_id: agentId },
        }
      );

      // Store additional metadata for each chunk
      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        const chunkContent = doc.pageContent;

        // Update the record with additional metadata
        const { error } = await this.supabaseClient
          .from('agent_knowledge')
          .upsert({
            agent_id: agentId,
            title: `${fileName} - Part ${i + 1}`,
            content: chunkContent,
            content_type: contentType,
            file_name: fileName,
            chunk_index: i,
            file_size: textContent.length,
            storage_path: storagePath,
            original_file_size: originalFileSize,
            processing_status: 'completed',
            metadata: {
              total_chunks: documents.length,
              chunk_size: chunkContent.length,
              original_file_type: contentType,
              langchain_processed: true,
            },
          });

        if (error) {
          logger.error({ error, agentId, chunkIndex: i }, 'Error updating chunk metadata');
        }
      }

      logger.info(
        { agentId, fileName, chunksProcessed: documents.length },
        'Document processing completed'
      );

      return {
        success: true,
        chunksProcessed: documents.length,
        totalChunks: documents.length,
      };
    } catch (error) {
      logger.error({ error, agentId, fileName }, 'Error processing document');
      throw error;
    }
  }

  /**
   * Query agent knowledge using LangChain RAG
   */
  async queryKnowledge(
    agentId: string,
    query: string,
    maxResults: number = 5,
    userId?: string,
    deliberationId?: string
  ): Promise<{
    success: boolean;
    response: string;
    knowledgeChunks: number;
    relevantKnowledge: any[];
    sources: string[];
  }> {
    try {
      logger.info({ agentId, query, userId }, 'Querying knowledge with LangChain');

      // Validate agent
      await this.validateLocalAgent(agentId);

      // Create vector store instance for retrieval
      const vectorStore = new SupabaseVectorStore(this.embeddings, {
        client: this.supabaseClient,
        tableName: 'agent_knowledge',
        queryName: 'match_agent_knowledge',
        filter: { agent_id: agentId },
      });

      // Create retriever with similarity search
      const retriever = vectorStore.asRetriever({
        k: maxResults,
        searchType: 'similarity',
        searchKwargs: {
          threshold: 0.1, // Low threshold for broader retrieval
        },
      });

      // Create enhanced prompt template for policy analysis
      const promptTemplate = PromptTemplate.fromTemplate(`
You are an expert policy analyst specializing in legislative documents and policy interpretation. 
Your role is to provide insightful, contextual analysis rather than simple factual recitation.

Context from relevant documents:
{context}

Question: {question}

Instructions:
1. Analyze the provided context thoroughly
2. Provide comprehensive insights, not just basic facts
3. Include practical implications and applications
4. Connect related concepts when relevant
5. If the context is insufficient, specify what additional information would be helpful
6. Maintain an authoritative but accessible tone
7. Cite specific sections or documents when referencing information

Generate a detailed analytical response:
`);

      // Create retrieval QA chain
      const chain = RetrievalQAChain.fromLLM(this.llm, retriever, {
        prompt: promptTemplate,
        returnSourceDocuments: true,
      });

      // Execute the query
      const result = await chain.call({
        query: query,
      });

      // Extract source information
      const sources = result.sourceDocuments?.map((doc: Document) => {
        const metadata = doc.metadata || {};
        return metadata.fileName || metadata.title || 'Unknown source';
      }) || [];

      // Get unique sources
      const uniqueSources = [...new Set(sources)];

      // Format relevant knowledge for response
      const relevantKnowledge = result.sourceDocuments?.map((doc: Document, index: number) => ({
        id: `langchain-chunk-${index}`,
        content: doc.pageContent,
        metadata: doc.metadata,
        similarity: 0.8, // LangChain doesn't return similarity scores directly
        title: doc.metadata?.title || `Chunk ${index + 1}`,
        file_name: doc.metadata?.fileName,
        chunk_index: doc.metadata?.chunkIndex || index,
      })) || [];

      logger.info(
        {
          agentId,
          query,
          chunksRetrieved: relevantKnowledge.length,
          sources: uniqueSources,
        },
        'Knowledge query completed'
      );

      return {
        success: true,
        response: result.text,
        knowledgeChunks: relevantKnowledge.length,
        relevantKnowledge,
        sources: uniqueSources,
      };
    } catch (error) {
      logger.error({ error, agentId, query }, 'Error querying knowledge');
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