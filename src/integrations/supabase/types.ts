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
          max_response_characters: number | null
          name: string
          preferred_model: string | null
          preset_questions: Json | null
          prompt_overrides: Json | null
          response_style: string | null
          updated_at: string | null
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
          max_response_characters?: number | null
          name: string
          preferred_model?: string | null
          preset_questions?: Json | null
          prompt_overrides?: Json | null
          response_style?: string | null
          updated_at?: string | null
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
          max_response_characters?: number | null
          name?: string
          preferred_model?: string | null
          preset_questions?: Json | null
          prompt_overrides?: Json | null
          response_style?: string | null
          updated_at?: string | null
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
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message_id: string
          rating: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message_id?: string
          rating?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_ratings_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_metrics: {
        Row: {
          created_at: string
          deliberation_id: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          model_used: string | null
          operation_type: string
          success: boolean
        }
        Insert: {
          created_at?: string
          deliberation_id?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          model_used?: string | null
          operation_type: string
          success: boolean
        }
        Update: {
          created_at?: string
          deliberation_id?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          model_used?: string | null
          operation_type?: string
          success?: boolean
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          id: string
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      circuit_breaker_state: {
        Row: {
          failure_count: number
          id: string
          is_open: boolean
          last_failure_time: string | null
          updated_at: string
        }
        Insert: {
          failure_count?: number
          id: string
          is_open?: boolean
          last_failure_time?: string | null
          updated_at?: string
        }
        Update: {
          failure_count?: number
          id?: string
          is_open?: boolean
          last_failure_time?: string | null
          updated_at?: string
        }
        Relationships: []
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
          updated_at: string
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
          updated_at?: string
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
          updated_at?: string
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
          updated_at: string | null
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
          updated_at?: string | null
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
          updated_at?: string | null
        }
        Relationships: [
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
      login_events: {
        Row: {
          id: string
          login_at: string
          user_id: string
        }
        Insert: {
          id?: string
          login_at?: string
          user_id: string
        }
        Update: {
          id?: string
          login_at?: string
          user_id?: string
        }
        Relationships: []
      }
      message_processing_locks: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          message_id: string
          processing_key: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          message_id: string
          processing_key: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          message_id?: string
          processing_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_message_processing_locks_message_id"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
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
      [_ in never]: never
    }
    Functions: {
      admin_create_ai_ibis_node: {
        Args: {
          p_deliberation_id: string
          p_description: string
          p_node_type: string
          p_position_x?: number
          p_position_y?: number
          p_title: string
        }
        Returns: {
          created_at: string
          created_by: string
          deliberation_id: string
          description: string
          id: string
          node_type: string
          position_x: number
          position_y: number
          title: string
        }[]
      }
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
      admin_get_system_stats: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      admin_update_agent_configuration: {
        Args: { p_agent_id: string; p_updates: Json }
        Returns: {
          id: string
          updated_at: string
        }[]
      }
      admin_update_ibis_node_position: {
        Args: { p_node_id: string; p_position_x: number; p_position_y: number }
        Returns: undefined
      }
      admin_update_ibis_relationship: {
        Args: { p_relationship_id: string; p_relationship_type: string }
        Returns: {
          id: string
          updated_at: string
        }[]
      }
      auth_is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      binary_quantize: {
        Args: { "": string } | { "": unknown }
        Returns: unknown
      }
      detect_user_attribution_anomalies: {
        Args: {
          p_deliberation_id?: string
          p_time_window_minutes?: number
          p_user_id: string
        }
        Returns: {
          anomaly_type: string
          created_at: string
          details: Json
          message_id: string
        }[]
      }
      generate_access_code_1: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      generate_access_code_2: {
        Args: Record<PropertyKey, never>
        Returns: string
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
      get_deliberation_stance_summary: {
        Args: { deliberation_uuid: string }
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
        Args: { message_uuid: string; user_uuid: string }
        Returns: {
          helpful_count: number
          total_ratings: number
          unhelpful_count: number
          user_rating: number
        }[]
      }
      get_prompt_template: {
        Args: { template_name: string }
        Returns: {
          category: string
          template_text: string
          variables: Json
          version: number
        }[]
      }
      get_prompt_template_optimized: {
        Args: { template_name: string }
        Returns: {
          category: string
          template_text: string
          variables: Json
          version: number
        }[]
      }
      get_user_deliberations: {
        Args: { user_uuid: string }
        Returns: {
          deliberation_id: string
        }[]
      }
      get_user_stance_trend: {
        Args: { deliberation_uuid: string; user_uuid: string }
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
      is_authenticated_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_participant_in_deliberation: {
        Args: { deliberation_id: string; user_id: string }
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
          p_record_id: string
          p_table_name: string
        }
        Returns: undefined
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
      match_ibis_nodes_for_query: {
        Args: {
          deliberation_uuid: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          description: string
          id: string
          node_type: string
          similarity: number
          title: string
        }[]
      }
      reset_circuit_breaker: {
        Args: { circuit_breaker_name: string }
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
