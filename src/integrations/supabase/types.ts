export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      access_codes: {
        Row: {
          code: string
          code_type: string
          created_at: string
          created_by: string | null
          current_uses: number | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          is_used: boolean
          last_used_at: string | null
          max_uses: number | null
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          code_type: string
          created_at?: string
          created_by?: string | null
          current_uses?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          is_used?: boolean
          last_used_at?: string | null
          max_uses?: number | null
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          code_type?: string
          created_at?: string
          created_by?: string | null
          current_uses?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          is_used?: boolean
          last_used_at?: string | null
          max_uses?: number | null
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
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
          preset_questions: Json | null
          response_style: string | null
          system_prompt: string
          updated_at: string
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
          preset_questions?: Json | null
          response_style?: string | null
          system_prompt: string
          updated_at?: string
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
          preset_questions?: Json | null
          response_style?: string | null
          system_prompt?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_configurations_deliberation_id_fkey"
            columns: ["deliberation_id"]
            isOneToOne: false
            referencedRelation: "deliberations"
            referencedColumns: ["id"]
          },
        ]
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
          updated_at: string
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
          updated_at?: string
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
          updated_at?: string
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
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip_address: unknown | null
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_address?: unknown | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: unknown | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
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
          updated_at: string | null
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
          updated_at?: string | null
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
          updated_at?: string | null
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
          updated_at: string | null
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
          updated_at?: string | null
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
          updated_at?: string | null
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
          updated_at: string | null
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
          updated_at?: string | null
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
          updated_at?: string | null
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
      ibis_nodes: {
        Row: {
          created_at: string | null
          created_by: string | null
          deliberation_id: string | null
          description: string | null
          id: string
          message_id: string | null
          node_type: Database["public"]["Enums"]["ibis_node_type"]
          parent_node_id: string | null
          position_x: number | null
          position_y: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          deliberation_id?: string | null
          description?: string | null
          id?: string
          message_id?: string | null
          node_type: Database["public"]["Enums"]["ibis_node_type"]
          parent_node_id?: string | null
          position_x?: number | null
          position_y?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          deliberation_id?: string | null
          description?: string | null
          id?: string
          message_id?: string | null
          node_type?: Database["public"]["Enums"]["ibis_node_type"]
          parent_node_id?: string | null
          position_x?: number | null
          position_y?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ibis_nodes_deliberation_id_fkey"
            columns: ["deliberation_id"]
            isOneToOne: false
            referencedRelation: "deliberations"
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
            foreignKeyName: "item_keywords_classified_item_id_fkey"
            columns: ["classified_item_id"]
            isOneToOne: false
            referencedRelation: "notions"
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
            foreignKeyName: "item_relationships_source_item_id_fkey"
            columns: ["source_item_id"]
            isOneToOne: false
            referencedRelation: "notions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_relationships_target_item_id_fkey"
            columns: ["target_item_id"]
            isOneToOne: false
            referencedRelation: "classified_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_relationships_target_item_id_fkey"
            columns: ["target_item_id"]
            isOneToOne: false
            referencedRelation: "notions"
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
            foreignKeyName: "item_similarities_item1_id_fkey"
            columns: ["item1_id"]
            isOneToOne: false
            referencedRelation: "notions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_similarities_item2_id_fkey"
            columns: ["item2_id"]
            isOneToOne: false
            referencedRelation: "classified_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_similarities_item2_id_fkey"
            columns: ["item2_id"]
            isOneToOne: false
            referencedRelation: "notions"
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
            foreignKeyName: "messages_deliberation_id_fkey"
            columns: ["deliberation_id"]
            isOneToOne: false
            referencedRelation: "deliberations"
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
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          display_name: string | null
          expertise_areas: string[] | null
          id: string
          role: string | null
          updated_at: string | null
          user_role: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          expertise_areas?: string[] | null
          id: string
          role?: string | null
          updated_at?: string | null
          user_role?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          expertise_areas?: string[] | null
          id?: string
          role?: string | null
          updated_at?: string | null
          user_role?: string | null
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
          updated_at: string | null
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
          updated_at?: string | null
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
          updated_at?: string | null
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
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      notions: {
        Row: {
          ai_generated: boolean | null
          confidence_score: number | null
          created_at: string | null
          created_by: string | null
          deliberation_id: string | null
          full_content: string | null
          headline: string | null
          id: string | null
          incoming_relationships: number | null
          item_type: string | null
          keywords: string[] | null
          message_id: string | null
          outgoing_relationships: number | null
          raw_content: string | null
          stance_score: number | null
          status: string | null
          submission_id: string | null
          submitter_id: string | null
          updated_at: string | null
          user_edited: boolean | null
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
          {
            foreignKeyName: "submissions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      user_cache: {
        Row: {
          deliberation_ids: string[] | null
          display_name: string | null
          expertise_areas: string[] | null
          id: string | null
          user_role: string | null
        }
        Insert: {
          deliberation_ids?: never
          display_name?: string | null
          expertise_areas?: string[] | null
          id?: string | null
          user_role?: string | null
        }
        Update: {
          deliberation_ids?: never
          display_name?: string | null
          expertise_areas?: string[] | null
          id?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      user_profiles_with_codes: {
        Row: {
          access_code: string | null
          avatar_url: string | null
          bio: string | null
          code_type: string | null
          created_at: string | null
          display_name: string | null
          expertise_areas: string[] | null
          id: string | null
          updated_at: string | null
          used_at: string | null
          user_role: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      assign_access_codes_to_users: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      audit_sensitive_operation: {
        Args: {
          operation_type: string
          table_name: string
          record_id?: string
          details?: Json
        }
        Returns: undefined
      }
      binary_quantize: {
        Args: { "": string } | { "": unknown }
        Returns: unknown
      }
      can_user_change_role: {
        Args: { target_user_id: string; new_role: string }
        Returns: boolean
      }
      cleanup_expired_access_codes: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      generate_secure_access_code: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_access_code_type: {
        Args: { access_code: string }
        Returns: string
      }
      get_current_user_role: {
        Args: Record<PropertyKey, never>
        Returns: string
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
      increment_access_code_usage: {
        Args: { input_code: string }
        Returns: boolean
      }
      is_admin_user: {
        Args: { user_id: string }
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
          p_table_name?: string
          p_record_id?: string
          p_old_values?: Json
          p_new_values?: Json
        }
        Returns: undefined
      }
      match_agent_knowledge: {
        Args: {
          input_agent_id: string
          query_embedding: string
          match_threshold: number
          match_count: number
        }
        Returns: {
          id: string
          agent_id: string
          title: string
          content: string
          content_type: string
          file_name: string
          chunk_index: number
          metadata: Json
          similarity: number
          created_at: string
        }[]
      }
      secure_increment_access_code_usage: {
        Args: { input_code: string }
        Returns: boolean
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
      validate_access_code: {
        Args: { input_code: string }
        Returns: {
          valid: boolean
          code_type: string
          expired: boolean
          max_uses_reached: boolean
        }[]
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
      deliberation_status: ["draft", "active", "concluded", "archived"],
      ibis_node_type: ["issue", "position", "argument", "question"],
      message_type: ["user", "bill_agent", "peer_agent", "flow_agent"],
      participant_role: ["facilitator", "participant", "observer"],
    },
  },
} as const
