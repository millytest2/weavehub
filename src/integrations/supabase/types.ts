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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      action_history: {
        Row: {
          action_date: string
          action_text: string
          completed_at: string
          created_at: string
          id: string
          pillar: string | null
          task_id: string | null
          task_sequence: number | null
          time_required: string | null
          user_id: string
          why_it_mattered: string | null
        }
        Insert: {
          action_date?: string
          action_text: string
          completed_at?: string
          created_at?: string
          id?: string
          pillar?: string | null
          task_id?: string | null
          task_sequence?: number | null
          time_required?: string | null
          user_id: string
          why_it_mattered?: string | null
        }
        Update: {
          action_date?: string
          action_text?: string
          completed_at?: string
          created_at?: string
          id?: string
          pillar?: string | null
          task_id?: string | null
          task_sequence?: number | null
          time_required?: string | null
          user_id?: string
          why_it_mattered?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "daily_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      connections: {
        Row: {
          created_at: string
          id: string
          note: string | null
          source_id: string
          source_type: string
          target_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          source_id: string
          source_type: string
          target_id: string
          target_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          source_id?: string
          source_type?: string
          target_id?: string
          target_type?: string
          user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          messages: Json
          tags: string[] | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          messages?: Json
          tags?: string[] | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          messages?: Json
          tags?: string[] | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_tasks: {
        Row: {
          completed: boolean | null
          created_at: string
          description: string | null
          id: string
          one_thing: string | null
          pillar: string | null
          reflection: string | null
          task_date: string
          task_sequence: number | null
          title: string
          user_id: string
          why_matters: string | null
        }
        Insert: {
          completed?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          one_thing?: string | null
          pillar?: string | null
          reflection?: string | null
          task_date?: string
          task_sequence?: number | null
          title: string
          user_id: string
          why_matters?: string | null
        }
        Update: {
          completed?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          one_thing?: string | null
          pillar?: string | null
          reflection?: string | null
          task_date?: string
          task_sequence?: number | null
          title?: string
          user_id?: string
          why_matters?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          access_count: number | null
          created_at: string
          embedding: string | null
          extracted_content: string | null
          file_path: string | null
          file_size: number | null
          file_type: string | null
          id: string
          last_accessed: string | null
          relevance_score: number | null
          summary: string | null
          title: string
          topic_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_count?: number | null
          created_at?: string
          embedding?: string | null
          extracted_content?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          last_accessed?: string | null
          relevance_score?: number | null
          summary?: string | null
          title: string
          topic_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_count?: number | null
          created_at?: string
          embedding?: string | null
          extracted_content?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          last_accessed?: string | null
          relevance_score?: number | null
          summary?: string | null
          title?: string
          topic_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_logs: {
        Row: {
          created_at: string
          day_number: number
          energy_level: number | null
          experiment_id: string
          id: string
          metrics_data: Json | null
          observations: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          day_number: number
          energy_level?: number | null
          experiment_id: string
          id?: string
          metrics_data?: Json | null
          observations?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          day_number?: number
          energy_level?: number | null
          experiment_id?: string
          id?: string
          metrics_data?: Json | null
          observations?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiment_logs_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      experiments: {
        Row: {
          baseline_impact: number | null
          completed_at: string | null
          content_fuel: number | null
          created_at: string
          current_day: number | null
          description: string | null
          duration: string | null
          duration_days: number | null
          experiment_type: string | null
          hypothesis: string | null
          id: string
          identity_alignment: number | null
          identity_shift_target: string | null
          learning_path_id: string | null
          metrics_tracked: Json | null
          result_summary: string | null
          results: string | null
          started_at: string | null
          status: string | null
          steps: string | null
          title: string
          topic_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          baseline_impact?: number | null
          completed_at?: string | null
          content_fuel?: number | null
          created_at?: string
          current_day?: number | null
          description?: string | null
          duration?: string | null
          duration_days?: number | null
          experiment_type?: string | null
          hypothesis?: string | null
          id?: string
          identity_alignment?: number | null
          identity_shift_target?: string | null
          learning_path_id?: string | null
          metrics_tracked?: Json | null
          result_summary?: string | null
          results?: string | null
          started_at?: string | null
          status?: string | null
          steps?: string | null
          title: string
          topic_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          baseline_impact?: number | null
          completed_at?: string | null
          content_fuel?: number | null
          created_at?: string
          current_day?: number | null
          description?: string | null
          duration?: string | null
          duration_days?: number | null
          experiment_type?: string | null
          hypothesis?: string | null
          id?: string
          identity_alignment?: number | null
          identity_shift_target?: string | null
          learning_path_id?: string | null
          metrics_tracked?: Json | null
          result_summary?: string | null
          results?: string | null
          started_at?: string | null
          status?: string | null
          steps?: string | null
          title?: string
          topic_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      identity_seeds: {
        Row: {
          content: string
          core_values: string | null
          created_at: string
          current_monthly_income: number | null
          current_phase: string | null
          days_to_move: number | null
          id: string
          job_apps_goal: number | null
          job_apps_this_week: number | null
          last_pillar_used: string | null
          target_monthly_income: number | null
          updated_at: string
          user_id: string
          weekly_focus: string | null
          year_note: string | null
        }
        Insert: {
          content: string
          core_values?: string | null
          created_at?: string
          current_monthly_income?: number | null
          current_phase?: string | null
          days_to_move?: number | null
          id?: string
          job_apps_goal?: number | null
          job_apps_this_week?: number | null
          last_pillar_used?: string | null
          target_monthly_income?: number | null
          updated_at?: string
          user_id: string
          weekly_focus?: string | null
          year_note?: string | null
        }
        Update: {
          content?: string
          core_values?: string | null
          created_at?: string
          current_monthly_income?: number | null
          current_phase?: string | null
          days_to_move?: number | null
          id?: string
          job_apps_goal?: number | null
          job_apps_this_week?: number | null
          last_pillar_used?: string | null
          target_monthly_income?: number | null
          updated_at?: string
          user_id?: string
          weekly_focus?: string | null
          year_note?: string | null
        }
        Relationships: []
      }
      insights: {
        Row: {
          access_count: number | null
          content: string
          created_at: string
          embedding: string | null
          id: string
          last_accessed: string | null
          relevance_score: number | null
          source: string | null
          title: string
          topic_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_count?: number | null
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          last_accessed?: string | null
          relevance_score?: number | null
          source?: string | null
          title: string
          topic_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_count?: number | null
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          last_accessed?: string | null
          relevance_score?: number | null
          source?: string | null
          title?: string
          topic_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_paths: {
        Row: {
          completed_at: string | null
          created_at: string
          current_day: number | null
          description: string | null
          duration_days: number | null
          final_deliverable: string | null
          id: string
          sources_used: Json | null
          started_at: string | null
          status: string | null
          structure: Json | null
          sub_topics: Json | null
          title: string
          topic_id: string | null
          topic_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_day?: number | null
          description?: string | null
          duration_days?: number | null
          final_deliverable?: string | null
          id?: string
          sources_used?: Json | null
          started_at?: string | null
          status?: string | null
          structure?: Json | null
          sub_topics?: Json | null
          title: string
          topic_id?: string | null
          topic_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_day?: number | null
          description?: string | null
          duration_days?: number | null
          final_deliverable?: string | null
          id?: string
          sources_used?: Json | null
          started_at?: string | null
          status?: string | null
          structure?: Json | null
          sub_topics?: Json | null
          title?: string
          topic_id?: string | null
          topic_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_paths_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_logs: {
        Row: {
          goal_id: string
          id: string
          logged_at: string
          notes: string | null
          user_id: string
          value: number
          week_number: number | null
          year: number | null
        }
        Insert: {
          goal_id: string
          id?: string
          logged_at?: string
          notes?: string | null
          user_id: string
          value: number
          week_number?: number | null
          year?: number | null
        }
        Update: {
          goal_id?: string
          id?: string
          logged_at?: string
          notes?: string | null
          user_id?: string
          value?: number
          week_number?: number | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "metric_logs_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "user_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      observations: {
        Row: {
          content: string
          created_at: string
          experiment_id: string | null
          generated_post: string | null
          id: string
          observation_type: string
          platform: string | null
          post_drafted: boolean | null
          posted_at: string | null
          source: string | null
          updated_at: string
          user_id: string
          your_data: string | null
        }
        Insert: {
          content: string
          created_at?: string
          experiment_id?: string | null
          generated_post?: string | null
          id?: string
          observation_type?: string
          platform?: string | null
          post_drafted?: boolean | null
          posted_at?: string | null
          source?: string | null
          updated_at?: string
          user_id: string
          your_data?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          experiment_id?: string | null
          generated_post?: string | null
          id?: string
          observation_type?: string
          platform?: string | null
          post_drafted?: boolean | null
          posted_at?: string | null
          source?: string | null
          updated_at?: string
          user_id?: string
          your_data?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "observations_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      path_daily_progress: {
        Row: {
          application_completed: boolean | null
          application_task: string | null
          completed_at: string | null
          created_at: string | null
          day_number: number
          id: string
          is_rest_day: boolean | null
          learning_completed: boolean | null
          learning_source_ref: string | null
          learning_task: string | null
          notes: string | null
          path_id: string
          user_id: string
        }
        Insert: {
          application_completed?: boolean | null
          application_task?: string | null
          completed_at?: string | null
          created_at?: string | null
          day_number: number
          id?: string
          is_rest_day?: boolean | null
          learning_completed?: boolean | null
          learning_source_ref?: string | null
          learning_task?: string | null
          notes?: string | null
          path_id: string
          user_id: string
        }
        Update: {
          application_completed?: boolean | null
          application_task?: string | null
          completed_at?: string | null
          created_at?: string | null
          day_number?: number
          id?: string
          is_rest_day?: boolean | null
          learning_completed?: boolean | null
          learning_source_ref?: string | null
          learning_task?: string | null
          notes?: string | null
          path_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "path_daily_progress_path_id_fkey"
            columns: ["path_id"]
            isOneToOne: false
            referencedRelation: "learning_paths"
            referencedColumns: ["id"]
          },
        ]
      }
      path_items: {
        Row: {
          completed: boolean | null
          created_at: string
          description: string | null
          id: string
          order_index: number
          path_id: string
          title: string
        }
        Insert: {
          completed?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          order_index: number
          path_id: string
          title: string
        }
        Update: {
          completed?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number
          path_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "path_items_path_id_fkey"
            columns: ["path_id"]
            isOneToOne: false
            referencedRelation: "learning_paths"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          function_name: string
          id: string
          request_count: number
          user_id: string
          window_start: string
        }
        Insert: {
          function_name: string
          id?: string
          request_count?: number
          user_id: string
          window_start?: string
        }
        Update: {
          function_name?: string
          id?: string
          request_count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      topics: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_activity_patterns: {
        Row: {
          activity_type: string
          created_at: string
          day_of_week: number
          hour_of_day: number
          id: string
          pillar: string | null
          user_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          day_of_week: number
          hour_of_day: number
          id?: string
          pillar?: string | null
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          day_of_week?: number
          hour_of_day?: number
          id?: string
          pillar?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_goals: {
        Row: {
          created_at: string
          current_value: number | null
          domain: string
          goal_name: string
          id: string
          target_date: string | null
          target_value: number
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_value?: number | null
          domain: string
          goal_name: string
          id?: string
          target_date?: string | null
          target_value: number
          unit: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_value?: number | null
          domain?: string
          goal_name?: string
          id?: string
          target_date?: string | null
          target_value?: number
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weekly_integrations: {
        Row: {
          body_notes: string | null
          body_score: number | null
          business_notes: string | null
          business_score: number | null
          content_notes: string | null
          content_score: number | null
          created_at: string
          cross_domain_insights: Json | null
          export_generated: boolean | null
          id: string
          mind_notes: string | null
          mind_score: number | null
          pattern_detected: string | null
          play_notes: string | null
          play_score: number | null
          relationship_notes: string | null
          relationship_score: number | null
          updated_at: string
          user_id: string
          week_number: number
          week_start: string
          year: number
        }
        Insert: {
          body_notes?: string | null
          body_score?: number | null
          business_notes?: string | null
          business_score?: number | null
          content_notes?: string | null
          content_score?: number | null
          created_at?: string
          cross_domain_insights?: Json | null
          export_generated?: boolean | null
          id?: string
          mind_notes?: string | null
          mind_score?: number | null
          pattern_detected?: string | null
          play_notes?: string | null
          play_score?: number | null
          relationship_notes?: string | null
          relationship_score?: number | null
          updated_at?: string
          user_id: string
          week_number: number
          week_start: string
          year: number
        }
        Update: {
          body_notes?: string | null
          body_score?: number | null
          business_notes?: string | null
          business_score?: number | null
          content_notes?: string | null
          content_score?: number | null
          created_at?: string
          cross_domain_insights?: Json | null
          export_generated?: boolean | null
          id?: string
          mind_notes?: string | null
          mind_score?: number | null
          pattern_detected?: string | null
          play_notes?: string | null
          play_score?: number | null
          relationship_notes?: string | null
          relationship_score?: number | null
          updated_at?: string
          user_id?: string
          week_number?: number
          week_start?: string
          year?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_relevance_decay: {
        Args: {
          access_count: number
          base_relevance?: number
          created_at: string
          last_accessed: string
        }
        Returns: number
      }
      check_rate_limit: {
        Args: {
          p_function_name: string
          p_max_requests?: number
          p_user_id: string
          p_window_minutes?: number
        }
        Returns: boolean
      }
      get_admin_analytics: {
        Args: never
        Returns: {
          total_documents: number
          total_experiments: number
          total_insights: number
          total_users: number
          users_this_month: number
          users_this_week: number
        }[]
      }
      get_admin_users: {
        Args: never
        Returns: {
          actions_completed: number
          created_at: string
          current_streak: number
          documents_count: number
          experiments_count: number
          full_name: string
          has_identity_seed: boolean
          id: string
          insights_count: number
          last_active: string
        }[]
      }
      get_user_time_preferences: {
        Args: { p_user_id: string }
        Returns: {
          complete_count: number
          hour_of_day: number
          request_count: number
          skip_count: number
          success_rate: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      search_documents_semantic: {
        Args: {
          match_count?: number
          query_embedding: string
          similarity_threshold?: number
          user_uuid: string
        }
        Returns: {
          created_at: string
          final_relevance: number
          id: string
          similarity: number
          summary: string
          title: string
        }[]
      }
      search_insights_semantic: {
        Args: {
          match_count?: number
          query_embedding: string
          similarity_threshold?: number
          user_uuid: string
        }
        Returns: {
          content: string
          created_at: string
          final_relevance: number
          id: string
          similarity: number
          source: string
          title: string
        }[]
      }
      update_item_access: {
        Args: { item_id: string; table_name: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
