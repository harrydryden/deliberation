export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      agent_configurations: {
        Row: {
          agent_type: string
          created_at: string
          created_by: string | null
          deliberation_id: string | null
          description: string | null
          facilitator_config: Json | null
          goals: string[] | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          preferred_model: string | null
          preset_questions: Json | null
          prompt_overrides: Json | null
          response_style: string | null
        }
        Insert: {
          agent_type: string
          created_at?: string
          created_by?: string | null
          deliberation_id?: string | null
          description?: string | null
          facilitator_config?: Json | null
          goals?: string[] | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          preferred_model?: string | null
          preset_questions?: Json | null
          prompt_overrides?: Json | null
          response_style?: string | null
        }
        Update: {
          agent_type?: string
          created_at?: string
          created_by?: string | null
          deliberation_id?: string | null
          description?: string | null
          facilitator_config?: Json | null
          goals?: string[] | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          preferred_model?: string | null
          preset_questions?: Json | null
          prompt_overrides?: Json | null
          response_style?: string | null
        }
        Relationships: []
      }
      agent_interactions: {
        Row: {
          agent_type: Database["public"]["Enums"]["message_type"]
          created_at: string | null
          deliberation_id: string | null
          id: string
          input_context: Json | null
          message_id: string | null
          output_response: string | null
          processing_time: number | null
        }
        Insert: {
          agent_type: Database["public"]["Enums"]["message_type"]
          created_at?: string | null
          deliberation_id?: string | null
          id?: string
          input_context?: Json | null
          message_id?: string | null
          output_response?: string | null
          processing_time?: number | null
        }
        Update: {
          agent_type?: Database["public"]["Enums"]["message_type"]
          created_at?: string | null
          deliberation_id?: string | null
          id?: string
          input_context?: Json | null
          message_id?: string | null
          output_response?: string | null
          processing_time?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_interactions_deliberation_id_fkey"
            columns: ["deliberation_id"]
            isOneToOne: false
            referencedRelation: "deliberations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_interactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "anonymized_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_interactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_knowledge: {
        Row: {
          agent_id: string | null
          chunk_index: number | null
          content: string
          content_type: string
          created_at: string
          created_by: string | null
          embedding: string | null
          file_name: string | null
          file_size: number | null
          id: string
          metadata: Json | null
          original_file_size: number | null
          processing_status: string | null
          storage_path: string | null
          title: string
        }
        Insert: {
          agent_id?: string | null
          chunk_index?: number | null
          content: string
          content_type: string
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          metadata?: Json | null
          original_file_size?: number | null
          processing_status?: string | null
          storage_path?: string | null
          title: string
        }
        Update: {
          agent_id?: string | null
          chunk_index?: number | null
          content?: string
          content_type?: string
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          metadata?: Json | null
          original_file_size?: number | null
          processing_status?: string | null
          storage_path?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_knowledge_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_ratings: {
        Row: {
          created_at: string | null
          id: string
          message_id: string
          rating: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message_id: string
          rating: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message_id?: string
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_ratings_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "anonymized_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_ratings_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          id: string
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      classified_items: {
        Row: {
          ai_generated: boolean | null
          confidence_score: number | null
          created_at: string | null
          created_by: string
          deliberation_id: string | null
          full_content: string
          headline: string
          id: string
          item_type: string
          stance_score: number | null
          status: string | null
          submission_id: string | null
          user_edited: boolean | null
        }
        Insert: {
          ai_generated?: boolean | null
          confidence_score?: number | null
          created_at?: string | null
          created_by: string
          deliberation_id?: string | null
          full_content: string
          headline: string
          id?: string
          item_type: string
          stance_score?: number | null
          status?: string | null
          submission_id?: string | null
          user_edited?: boolean | null
        }
        Update: {
          ai_generated?: boolean | null
          confidence_score?: number | null
          created_at?: string | null
          created_by?: string
          deliberation_id?: string | null
          full_content?: string
          headline?: string
          id?: string
          item_type?: string
          stance_score?: number | null
          status?: string | null
          submission_id?: string | null
          user_edited?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "classified_items_deliberation_id_fkey"
            columns: ["deliberation_id"]
            isOneToOne: false
            referencedRelation: "deliberations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classified_items_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      deliberations: {
        Row: {
          created_at: string | null
          description: string | null
          end_time: string | null
          facilitator_id: string | null
          id: string
          is_public: boolean | null
          max_participants: number | null
          notion: string | null
          start_time: string | null
          status: Database["public"]["Enums"]["deliberation_status"] | null
          title: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          end_time?: string | null
          facilitator_id?: string | null
          id?: string
          is_public?: boolean | null
          max_participants?: number | null
          notion?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["deliberation_status"] | null
          title: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          end_time?: string | null
          facilitator_id?: string | null
          id?: string
          is_public?: boolean | null
          max_participants?: number | null
          notion?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["deliberation_status"] | null
          title?: string
        }
        Relationships: []
      }
      facilitator_sessions: {
        Row: {
          agent_config_id: string
          created_at: string | null
          deliberation_id: string | null
          id: string
          last_activity_time: string | null
          last_prompt_time: string | null
          prompts_sent_count: number | null
          session_state: Json | null
          user_id: string
        }
        Insert: {
          agent_config_id: string
          created_at?: string | null
          deliberation_id?: string | null
          id?: string
          last_activity_time?: string | null
          last_prompt_time?: string | null
          prompts_sent_count?: number | null
          session_state?: Json | null
          user_id: string
        }
        Update: {
          agent_config_id?: string
          created_at?: string | null
          deliberation_id?: string | null
          id?: string
          last_activity_time?: string | null
          last_prompt_time?: string | null
          prompts_sent_count?: number | null
          session_state?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "facilitator_sessions_agent_config_id_fkey"
            columns: ["agent_config_id"]
            isOneToOne: false
            referencedRelation: "agent_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      file_processing_logs: {
        Row: {
          created_at: string | null
          error_details: Json | null
          file_name: string
          file_size: number | null
          file_type: string | null
          id: string
          processing_status: string | null
          security_scan_status: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          error_details?: Json | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          processing_status?: string | null
          security_scan_status?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          error_details?: Json | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          processing_status?: string | null
          security_scan_status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ibis_node_ratings: {
        Row: {
          created_at: string
          deliberation_id: string | null
          ibis_node_id: string
          id: string
          message_id: string
          rating: number
          user_id: string
        }
        Insert: {
          created_at?: string
          deliberation_id?: string | null
          ibis_node_id: string
          id?: string
          message_id: string
          rating: number
          user_id: string
        }
        Update: {
          created_at?: string
          deliberation_id?: string | null
          ibis_node_id?: string
          id?: string
          message_id?: string
          rating?: number
          user_id?: string
        }
        Relationships: []
      }
      ibis_nodes: {
        Row: {
          created_at: string | null
          created_by: string | null
          deliberation_id: string | null
          description: string | null
          embedding: string | null
          id: string
          message_id: string | null
          node_type: Database["public"]["Enums"]["ibis_node_type"]
          parent_node_id: string | null
          position_x: number | null
          position_y: number | null
          title: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          deliberation_id?: string | null
          description?: string | null
          embedding?: string | null
          id?: string
          message_id?: string | null
          node_type: Database["public"]["Enums"]["ibis_node_type"]
          parent_node_id?: string | null
          position_x?: number | null
          position_y?: number | null
          title: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          deliberation_id?: string | null
          description?: string | null
          embedding?: string | null
          id?: string
          message_id?: string | null
          node_type?: Database["public"]["Enums"]["ibis_node_type"]
          parent_node_id?: string | null
          position_x?: number | null
          position_y?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ibis_nodes_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "anonymized_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ibis_nodes_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ibis_nodes_parent_node_id_fkey"
            columns: ["parent_node_id"]
            isOneToOne: false
            referencedRelation: "ibis_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      ibis_relationships: {
        Row: {
          created_at: string
          created_by: string
          deliberation_id: string
          id: string
          relationship_type: string
          source_node_id: string
          target_node_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          deliberation_id: string
          id?: string
          relationship_type: string
          source_node_id: string
          target_node_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deliberation_id?: string
          id?: string
          relationship_type?: string
          source_node_id?: string
          target_node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_ibr_deliberation"
            columns: ["deliberation_id"]
            isOneToOne: false
            referencedRelation: "deliberations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ibr_source"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "ibis_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ibr_target"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "ibis_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      item_keywords: {
        Row: {
          classified_item_id: string | null
          created_at: string | null
          id: string
          keyword_id: string | null
          relevance_score: number | null
        }
        Insert: {
          classified_item_id?: string | null
          created_at?: string | null
          id?: string
          keyword_id?: string | null
          relevance_score?: number | null
        }
        Update: {
          classified_item_id?: string | null
          created_at?: string | null
          id?: string
          keyword_id?: string | null
          relevance_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "item_keywords_classified_item_id_fkey"
            columns: ["classified_item_id"]
            isOneToOne: false
            referencedRelation: "classified_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_keywords_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "keywords"
            referencedColumns: ["id"]
          },
        ]
      }
      item_relationships: {
        Row: {
          ai_generated: boolean | null
          created_at: string | null
          id: string
          relationship_type: string
          source_item_id: string | null
          strength: number | null
          target_item_id: string | null
          user_confirmed: boolean | null
        }
        Insert: {
          ai_generated?: boolean | null
          created_at?: string | null
          id?: string
          relationship_type: string
          source_item_id?: string | null
          strength?: number | null
          target_item_id?: string | null
          user_confirmed?: boolean | null
        }
        Update: {
          ai_generated?: boolean | null
          created_at?: string | null
          id?: string
          relationship_type?: string
          source_item_id?: string | null
          strength?: number | null
          target_item_id?: string | null
          user_confirmed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "item_relationships_source_item_id_fkey"
            columns: ["source_item_id"]
            isOneToOne: false
            referencedRelation: "classified_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_relationships_target_item_id_fkey"
            columns: ["target_item_id"]
            isOneToOne: false
            referencedRelation: "classified_items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_similarities: {
        Row: {
          computed_at: string | null
          id: string
          item1_id: string | null
          item2_id: string | null
          similarity_score: number | null
          similarity_type: string | null
        }
        Insert: {
          computed_at?: string | null
          id?: string
          item1_id?: string | null
          item2_id?: string | null
          similarity_score?: number | null
          similarity_type?: string | null
        }
        Update: {
          computed_at?: string | null
          id?: string
          item1_id?: string | null
          item2_id?: string | null
          similarity_score?: number | null
          similarity_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_similarities_item1_id_fkey"
            columns: ["item1_id"]
            isOneToOne: false
            referencedRelation: "classified_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_similarities_item2_id_fkey"
            columns: ["item2_id"]
            isOneToOne: false
            referencedRelation: "classified_items"
            referencedColumns: ["id"]
          },
        ]
      }
      keywords: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          keyword: string
          usage_count: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          keyword: string
          usage_count?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          keyword?: string
          usage_count?: number | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          agent_context: Json | null
          content: string
          created_at: string | null
          deliberation_id: string | null
          id: string
          message_type: Database["public"]["Enums"]["message_type"] | null
          parent_message_id: string | null
          submitted_to_ibis: boolean | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          agent_context?: Json | null
          content: string
          created_at?: string | null
          deliberation_id?: string | null
          id?: string
          message_type?: Database["public"]["Enums"]["message_type"] | null
          parent_message_id?: string | null
          submitted_to_ibis?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          agent_context?: Json | null
          content?: string
          created_at?: string | null
          deliberation_id?: string | null
          id?: string
          message_type?: Database["public"]["Enums"]["message_type"] | null
          parent_message_id?: string | null
          submitted_to_ibis?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "anonymized_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          deliberation_id: string | null
          id: string
          joined_at: string | null
          last_active: string | null
          role: Database["public"]["Enums"]["participant_role"] | null
          user_id: string | null
        }
        Insert: {
          deliberation_id?: string | null
          id?: string
          joined_at?: string | null
          last_active?: string | null
          role?: Database["public"]["Enums"]["participant_role"] | null
          user_id?: string | null
        }
        Update: {
          deliberation_id?: string | null
          id?: string
          joined_at?: string | null
          last_active?: string | null
          role?: Database["public"]["Enums"]["participant_role"] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "participants_deliberation_id_fkey"
            columns: ["deliberation_id"]
            isOneToOne: false
            referencedRelation: "deliberations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          access_code_1: string | null
          access_code_2: string | null
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          created_at: string | null
          id: string
          is_archived: boolean | null
          user_role: Database["public"]["Enums"]["app_role"] | null
        }
        Insert: {
          access_code_1?: string | null
          access_code_2?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string | null
          id: string
          is_archived?: boolean | null
          user_role?: Database["public"]["Enums"]["app_role"] | null
        }
        Update: {
          access_code_1?: string | null
          access_code_2?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          user_role?: Database["public"]["Enums"]["app_role"] | null
        }
        Relationships: []
      }
      prompt_templates: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          deliberation_id: string | null
          description: string | null
          id: string
          is_active: boolean
          metadata: Json | null
          name: string
          template_text: string
          variables: Json | null
          version: number
        }
        Insert: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          deliberation_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json | null
          name: string
          template_text: string
          variables?: Json | null
          version?: number
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          deliberation_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json | null
          name?: string
          template_text?: string
          variables?: Json | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_pt_deliberation"
            columns: ["deliberation_id"]
            isOneToOne: false
            referencedRelation: "deliberations"
            referencedColumns: ["id"]
          },
        ]
      }
      simplified_events: {
        Row: {
          created_at: string | null
          details: Json | null
          event_type: string
          id: string
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          event_type: string
          id?: string
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          event_type?: string
          id?: string
        }
        Relationships: []
      }
      submissions: {
        Row: {
          created_at: string | null
          deliberation_id: string | null
          id: string
          message_id: string | null
          processing_status: string | null
          raw_content: string
          submission_type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          deliberation_id?: string | null
          id?: string
          message_id?: string | null
          processing_status?: string | null
          raw_content: string
          submission_type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          deliberation_id?: string | null
          id?: string
          message_id?: string | null
          processing_status?: string | null
          raw_content?: string
          submission_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_deliberation_id_fkey"
            columns: ["deliberation_id"]
            isOneToOne: false
            referencedRelation: "deliberations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "anonymized_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_logs: {
        Row: {
          activity_data: Json | null
          activity_type: string
          deliberation_id: string | null
          id: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          activity_data?: Json | null
          activity_type: string
          deliberation_id?: string | null
          id?: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          activity_data?: Json | null
          activity_type?: string
          deliberation_id?: string | null
          id?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_logs_deliberation_id_fkey"
            columns: ["deliberation_id"]
            isOneToOne: false
            referencedRelation: "deliberations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_activity_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "user_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          recently_active: boolean | null
          session_token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          recently_active?: boolean | null
          session_token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          recently_active?: boolean | null
          session_token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      user_stance_scores: {
        Row: {
          confidence_score: number
          created_at: string | null
          deliberation_id: string
          id: string
          last_updated: string | null
          semantic_analysis: Json | null
          stance_score: number
          user_id: string
        }
        Insert: {
          confidence_score: number
          created_at?: string | null
          deliberation_id: string
          id?: string
          last_updated?: string | null
          semantic_analysis?: Json | null
          stance_score: number
          user_id: string
        }
        Update: {
          confidence_score?: number
          created_at?: string | null
          deliberation_id?: string
          id?: string
          last_updated?: string | null
          semantic_analysis?: Json | null
          stance_score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_uss_delib"
            columns: ["deliberation_id"]
            isOneToOne: false
            referencedRelation: "deliberations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_stance_scores_deliberation_id_fkey"
            columns: ["deliberation_id"]
            isOneToOne: false
            referencedRelation: "deliberations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      anonymized_messages: {
        Row: {
          agent_context: Json | null
          content: string | null
          created_at_daily: string | null
          created_at_hourly: string | null
          deliberation_id: string | null
          id: string | null
          message_type: Database["public"]["Enums"]["message_type"] | null
          parent_message_id: string | null
          submitted_to_ibis: boolean | null
          user_id: string | null
        }
        Insert: {
          agent_context?: Json | null
          content?: string | null
          created_at_daily?: never
          created_at_hourly?: never
          deliberation_id?: string | null
          id?: string | null
          message_type?: Database["public"]["Enums"]["message_type"] | null
          parent_message_id?: string | null
          submitted_to_ibis?: boolean | null
          user_id?: string | null
        }
        Update: {
          agent_context?: Json | null
          content?: string | null
          created_at_daily?: never
          created_at_hourly?: never
          deliberation_id?: string | null
          id?: string | null
          message_type?: Database["public"]["Enums"]["message_type"] | null
          parent_message_id?: string | null
          submitted_to_ibis?: boolean | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "anonymized_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_create_ibis_relationship: {
        Args: {
          p_created_by: string
          p_deliberation_id: string
          p_relationship_type: string
          p_source_node_id: string
          p_target_node_id: string
        }
        Returns: {
          created_at: string
          id: string
        }[]
      }
      admin_delete_ibis_relationship: {
        Args: { p_relationship_id: string }
        Returns: boolean
      }
      admin_get_ibis_nodes: {
        Args: { target_deliberation_id: string }
        Returns: {
          created_at: string
          created_by: string
          deliberation_id: string
          description: string
          embedding: string
          id: string
          message_id: string
          node_type: string
          parent_node_id: string
          position_x: number
          position_y: number
          title: string
          updated_at: string
        }[]
      }
      admin_get_ibis_relationships: {
        Args: { target_deliberation_id: string }
        Returns: {
          created_at: string
          created_by: string
          deliberation_id: string
          id: string
          relationship_type: string
          source_node_id: string
          target_node_id: string
        }[]
      }
      admin_update_agent_configuration: {
        Args:
          | { p_access_code: string; p_agent_id: string; p_updates: Json }
          | { p_agent_id: string; p_updates: Json }
        Returns: {
          id: string
          updated_at: string
        }[]
      }
      admin_update_ibis_node_position: {
        Args: { p_node_id: string; p_position_x: number; p_position_y: number }
        Returns: {
          id: string
          updated_at: string
        }[]
      }
      admin_update_ibis_relationship: {
        Args: { p_relationship_id: string; p_relationship_type: string }
        Returns: {
          id: string
          updated_at: string
        }[]
      }
      anonymize_old_sessions: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      anonymize_timestamp_to_day: {
        Args: { ts: string }
        Returns: string
      }
      anonymize_timestamp_to_hour: {
        Args: { ts: string }
        Returns: string
      }
      auth_is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      binary_quantize: {
        Args: { "": string } | { "": unknown }
        Returns: unknown
      }
      can_user_change_role: {
        Args: { new_role: string; target_user_id: string }
        Returns: boolean
      }
      cleanup_orphaned_sessions: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      debug_auth_functions: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      debug_current_user_settings: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      debug_storage_context: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      generate_access_code_1: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      generate_access_code_2: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_admin_system_stats: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_authenticated_user: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_current_user_deliberation_ids: {
        Args: Record<PropertyKey, never>
        Returns: {
          deliberation_id: string
        }[]
      }
      get_current_user_role: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_deliberation_stance_summary: {
        Args: { deliberation_txt: string } | { deliberation_uuid: string }
        Returns: {
          average_confidence: number
          average_stance: number
          negative_users: number
          neutral_users: number
          positive_users: number
          total_users: number
        }[]
      }
      get_local_agents_admin: {
        Args: Record<PropertyKey, never>
        Returns: {
          agent_type: string
          created_at: string
          created_by: string
          deliberation_id: string
          description: string
          facilitator_config: Json
          goals: string[]
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          preset_questions: Json
          prompt_overrides: Json
          response_style: string
        }[]
      }
      get_message_rating_summary: {
        Args:
          | { message_uuid: string }
          | { message_uuid: string; user_uuid: string }
        Returns: {
          average_rating: number
          helpful_count: number
          helpful_percentage: number
          total_ratings: number
          unhelpful_count: number
        }[]
      }
      get_profile_count: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      get_prompt_template: {
        Args: { template_name: string; template_variables?: Json }
        Returns: {
          category: string
          template_text: string
          variables: Json
          version: number
        }[]
      }
      get_user_deliberation_ids: {
        Args: { user_uuid: string }
        Returns: {
          deliberation_id: string
        }[]
      }
      get_user_deliberation_ids_safe: {
        Args: { user_uuid: string }
        Returns: {
          deliberation_id: string
        }[]
      }
      get_user_deliberations: {
        Args: { user_uuid: string }
        Returns: {
          deliberation_id: string
        }[]
      }
      get_user_stance_trend: {
        Args:
          | { deliberation_txt: string; user_uuid: string }
          | { deliberation_uuid: string; user_uuid: string }
        Returns: {
          confidence_score: number
          date: string
          stance_score: number
        }[]
      }
      halfvec_avg: {
        Args: { "": number[] }
        Returns: unknown
      }
      halfvec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      halfvec_send: {
        Args: { "": unknown }
        Returns: string
      }
      halfvec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hnsw_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_sparsevec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnswhandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_admin_user: {
        Args: Record<PropertyKey, never> | { user_id: string }
        Returns: boolean
      }
      is_admin_user_simple: {
        Args: { access_code: string }
        Returns: boolean
      }
      is_authenticated_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_facilitator_of_deliberation: {
        Args: { deliberation_id: string; user_id: string }
        Returns: boolean
      }
      is_participant_in_deliberation: {
        Args: { deliberation_id: string; user_id: string }
        Returns: boolean
      }
      is_user_participant_in_deliberation: {
        Args: { deliberation_uuid: string; user_uuid: string }
        Returns: boolean
      }
      ivfflat_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflat_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflathandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      l2_norm: {
        Args: { "": unknown } | { "": unknown }
        Returns: number
      }
      l2_normalize: {
        Args: { "": string } | { "": unknown } | { "": unknown }
        Returns: string
      }
      log_admin_action: {
        Args: {
          p_action: string
          p_new_values?: Json
          p_old_values?: Json
          p_record_id?: string
          p_table_name?: string
        }
        Returns: undefined
      }
      log_security_event: {
        Args: { details?: Json; event_type: string }
        Returns: undefined
      }
      mark_sessions_inactive: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      match_agent_knowledge: {
        Args: {
          input_agent_id: string
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          agent_id: string
          chunk_index: number
          content: string
          content_type: string
          created_at: string
          file_name: string
          id: string
          metadata: Json
          similarity: number
          title: string
        }[]
      }
      set_config: {
        Args: { is_local?: boolean; new_value: string; setting_name: string }
        Returns: string
      }
      sparsevec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      sparsevec_send: {
        Args: { "": unknown }
        Returns: string
      }
      sparsevec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      update_session_activity_simple: {
        Args: { session_uuid: string }
        Returns: boolean
      }
      user_participates_in_deliberation: {
        Args: { deliberation_uuid: string; user_uuid: string }
        Returns: boolean
      }
      user_participates_in_deliberation_by_code: {
        Args: { deliberation_uuid: string }
        Returns: boolean
      }
      user_participates_in_deliberation_safe: {
        Args: { deliberation_uuid: string; user_uuid: string }
        Returns: boolean
      }
      vector_avg: {
        Args: { "": number[] }
        Returns: string
      }
      vector_dims: {
        Args: { "": string } | { "": unknown }
        Returns: number
      }
      vector_norm: {
        Args: { "": string }
        Returns: number
      }
      vector_out: {
        Args: { "": string }
        Returns: unknown
      }
      vector_send: {
        Args: { "": string }
        Returns: string
      }
      vector_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "user"
      deliberation_status: "draft" | "active" | "concluded" | "archived"
      ibis_node_type: "issue" | "position" | "argument" | "question"
      message_type: "user" | "bill_agent" | "peer_agent" | "flow_agent"
      participant_role: "facilitator" | "participant" | "observer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      deliberation_status: ["draft", "active", "concluded", "archived"],
      ibis_node_type: ["issue", "position", "argument", "question"],
      message_type: ["user", "bill_agent", "peer_agent", "flow_agent"],
      participant_role: ["facilitator", "participant", "observer"],
    },
  },
} as const
