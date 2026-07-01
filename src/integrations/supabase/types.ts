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
      action_completions: {
        Row: {
          completion_date: string
          created_at: string | null
          daily_task_id: string | null
          id: string
          status: string
          user_id: string
          what_happened: string | null
        }
        Insert: {
          completion_date?: string
          created_at?: string | null
          daily_task_id?: string | null
          id?: string
          status?: string
          user_id: string
          what_happened?: string | null
        }
        Update: {
          completion_date?: string
          created_at?: string | null
          daily_task_id?: string | null
          id?: string
          status?: string
          user_id?: string
          what_happened?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_completions_daily_task_id_fkey"
            columns: ["daily_task_id"]
            isOneToOne: false
            referencedRelation: "daily_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
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
      calendar_settings: {
        Row: {
          cache_date: string | null
          cached_events: Json | null
          created_at: string
          google_calendar_enabled: boolean | null
          id: string
          last_synced_at: string | null
          primary_calendar_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cache_date?: string | null
          cached_events?: Json | null
          created_at?: string
          google_calendar_enabled?: boolean | null
          id?: string
          last_synced_at?: string | null
          primary_calendar_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cache_date?: string | null
          cached_events?: Json | null
          created_at?: string
          google_calendar_enabled?: boolean | null
          id?: string
          last_synced_at?: string | null
          primary_calendar_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      daily_briefs: {
        Row: {
          brief_date: string
          created_at: string | null
          forgotten_gem_context: string | null
          forgotten_gem_id: string | null
          generated_at: string | null
          id: string
          recommended_actions: Json | null
          user_id: string
          what_shifted: string | null
        }
        Insert: {
          brief_date: string
          created_at?: string | null
          forgotten_gem_context?: string | null
          forgotten_gem_id?: string | null
          generated_at?: string | null
          id?: string
          recommended_actions?: Json | null
          user_id: string
          what_shifted?: string | null
        }
        Update: {
          brief_date?: string
          created_at?: string | null
          forgotten_gem_context?: string | null
          forgotten_gem_id?: string | null
          generated_at?: string | null
          id?: string
          recommended_actions?: Json | null
          user_id?: string
          what_shifted?: string | null
        }
        Relationships: []
      }
      daily_closes: {
        Row: {
          close_date: string
          created_at: string | null
          daily_brief_id: string | null
          id: string
          journal_entry: string | null
          patterns_noticed: string | null
          user_id: string
        }
        Insert: {
          close_date: string
          created_at?: string | null
          daily_brief_id?: string | null
          id?: string
          journal_entry?: string | null
          patterns_noticed?: string | null
          user_id: string
        }
        Update: {
          close_date?: string
          created_at?: string | null
          daily_brief_id?: string | null
          id?: string
          journal_entry?: string | null
          patterns_noticed?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_closes_daily_brief_id_fkey"
            columns: ["daily_brief_id"]
            isOneToOne: false
            referencedRelation: "daily_briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_credits: {
        Row: {
          actions_committed: string[] | null
          created_at: string | null
          credit_date: string
          credits_spent: number | null
          id: string
          total_credits: number | null
          user_id: string
        }
        Insert: {
          actions_committed?: string[] | null
          created_at?: string | null
          credit_date: string
          credits_spent?: number | null
          id?: string
          total_credits?: number | null
          user_id: string
        }
        Update: {
          actions_committed?: string[] | null
          created_at?: string | null
          credit_date?: string
          credits_spent?: number | null
          id?: string
          total_credits?: number | null
          user_id?: string
        }
        Relationships: []
      }
      daily_scoreboard: {
        Row: {
          ai_leverage_rep: boolean | null
          charisma_rep: boolean | null
          content_rep: boolean | null
          created_at: string
          fitness_rep: boolean | null
          id: string
          money_rep: boolean | null
          notes: string | null
          relationship_rep: boolean | null
          sales_rep: boolean | null
          scoreboard_date: string
          upath_rep: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_leverage_rep?: boolean | null
          charisma_rep?: boolean | null
          content_rep?: boolean | null
          created_at?: string
          fitness_rep?: boolean | null
          id?: string
          money_rep?: boolean | null
          notes?: string | null
          relationship_rep?: boolean | null
          sales_rep?: boolean | null
          scoreboard_date?: string
          upath_rep?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_leverage_rep?: boolean | null
          charisma_rep?: boolean | null
          content_rep?: boolean | null
          created_at?: string
          fitness_rep?: boolean | null
          id?: string
          money_rep?: boolean | null
          notes?: string | null
          relationship_rep?: boolean | null
          sales_rep?: boolean | null
          scoreboard_date?: string
          upath_rep?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_tasks: {
        Row: {
          action_type: string | null
          cited_sources: Json | null
          completed: boolean | null
          created_at: string
          credit_cost: number | null
          daily_brief_id: string | null
          description: string | null
          id: string
          impact_description: string | null
          one_thing: string | null
          pillar: string | null
          priority: string | null
          reflection: string | null
          task_date: string
          task_sequence: number | null
          title: string
          user_id: string
          why_matters: string | null
        }
        Insert: {
          action_type?: string | null
          cited_sources?: Json | null
          completed?: boolean | null
          created_at?: string
          credit_cost?: number | null
          daily_brief_id?: string | null
          description?: string | null
          id?: string
          impact_description?: string | null
          one_thing?: string | null
          pillar?: string | null
          priority?: string | null
          reflection?: string | null
          task_date?: string
          task_sequence?: number | null
          title: string
          user_id: string
          why_matters?: string | null
        }
        Update: {
          action_type?: string | null
          cited_sources?: Json | null
          completed?: boolean | null
          created_at?: string
          credit_cost?: number | null
          daily_brief_id?: string | null
          description?: string | null
          id?: string
          impact_description?: string | null
          one_thing?: string | null
          pillar?: string | null
          priority?: string | null
          reflection?: string | null
          task_date?: string
          task_sequence?: number | null
          title?: string
          user_id?: string
          why_matters?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_tasks_daily_brief_id_fkey"
            columns: ["daily_brief_id"]
            isOneToOne: false
            referencedRelation: "daily_briefs"
            referencedColumns: ["id"]
          },
        ]
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
          acceptance_criteria: Json | null
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
          acceptance_criteria?: Json | null
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
          acceptance_criteria?: Json | null
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
      grounding_log: {
        Row: {
          created_at: string
          emotional_state: string | null
          gentle_rep: string | null
          id: string
          matched_source_id: string | null
          matched_source_title: string | null
          matched_source_type: string | null
          reminder: string | null
          resonated: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string
          emotional_state?: string | null
          gentle_rep?: string | null
          id?: string
          matched_source_id?: string | null
          matched_source_title?: string | null
          matched_source_type?: string | null
          reminder?: string | null
          resonated?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string
          emotional_state?: string | null
          gentle_rep?: string | null
          id?: string
          matched_source_id?: string | null
          matched_source_title?: string | null
          matched_source_type?: string | null
          reminder?: string | null
          resonated?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      identity_seeds: {
        Row: {
          content: string
          content_applied_count: number | null
          content_saved_count: number | null
          core_values: string | null
          created_at: string
          current_monthly_income: number | null
          current_phase: string | null
          days_to_move: number | null
          id: string
          job_apps_goal: number | null
          job_apps_this_week: number | null
          last_pillar_used: string | null
          life_domains: string | null
          target_monthly_income: number | null
          updated_at: string
          user_id: string
          weekly_focus: string | null
          year_note: string | null
        }
        Insert: {
          content: string
          content_applied_count?: number | null
          content_saved_count?: number | null
          core_values?: string | null
          created_at?: string
          current_monthly_income?: number | null
          current_phase?: string | null
          days_to_move?: number | null
          id?: string
          job_apps_goal?: number | null
          job_apps_this_week?: number | null
          last_pillar_used?: string | null
          life_domains?: string | null
          target_monthly_income?: number | null
          updated_at?: string
          user_id: string
          weekly_focus?: string | null
          year_note?: string | null
        }
        Update: {
          content?: string
          content_applied_count?: number | null
          content_saved_count?: number | null
          core_values?: string | null
          created_at?: string
          current_monthly_income?: number | null
          current_phase?: string | null
          days_to_move?: number | null
          id?: string
          job_apps_goal?: number | null
          job_apps_this_week?: number | null
          last_pillar_used?: string | null
          life_domains?: string | null
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
      learned_patterns: {
        Row: {
          confidence: number | null
          created_at: string | null
          id: string
          last_observed: string | null
          outcome: string
          pattern_type: string
          times_observed: number | null
          trigger_condition: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          id?: string
          last_observed?: string | null
          outcome: string
          pattern_type: string
          times_observed?: number | null
          trigger_condition: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          id?: string
          last_observed?: string | null
          outcome?: string
          pattern_type?: string
          times_observed?: number | null
          trigger_condition?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
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
      monthly_plans: {
        Row: {
          completed: boolean | null
          created_at: string
          event_date: string | null
          id: string
          month_number: number
          plan_type: string
          sort_order: number | null
          text: string
          user_id: string
          year: number
        }
        Insert: {
          completed?: boolean | null
          created_at?: string
          event_date?: string | null
          id?: string
          month_number: number
          plan_type?: string
          sort_order?: number | null
          text: string
          user_id: string
          year: number
        }
        Update: {
          completed?: boolean | null
          created_at?: string
          event_date?: string | null
          id?: string
          month_number?: number
          plan_type?: string
          sort_order?: number | null
          text?: string
          user_id?: string
          year?: number
        }
        Relationships: []
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
      pending_actions: {
        Row: {
          action_context: string | null
          action_text: string
          completed_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          source_id: string
          source_title: string
          source_type: string
          status: string
          suggested_path_id: string | null
          user_id: string
        }
        Insert: {
          action_context?: string | null
          action_text: string
          completed_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          source_id: string
          source_title: string
          source_type: string
          status?: string
          suggested_path_id?: string | null
          user_id: string
        }
        Update: {
          action_context?: string | null
          action_text?: string
          completed_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          source_id?: string
          source_title?: string
          source_type?: string
          status?: string
          suggested_path_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      platform_voice_templates: {
        Row: {
          avoid_list: string[] | null
          brand_identity: string | null
          content_pillars: Json | null
          created_at: string
          id: string
          personality_blend: string | null
          platform_voices: Json | null
          updated_at: string
          user_id: string
          values: string[] | null
          vision_summary: string | null
        }
        Insert: {
          avoid_list?: string[] | null
          brand_identity?: string | null
          content_pillars?: Json | null
          created_at?: string
          id?: string
          personality_blend?: string | null
          platform_voices?: Json | null
          updated_at?: string
          user_id: string
          values?: string[] | null
          vision_summary?: string | null
        }
        Update: {
          avoid_list?: string[] | null
          brand_identity?: string | null
          content_pillars?: Json | null
          created_at?: string
          id?: string
          personality_blend?: string | null
          platform_voices?: Json | null
          updated_at?: string
          user_id?: string
          values?: string[] | null
          vision_summary?: string | null
        }
        Relationships: []
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
      skill_stack: {
        Row: {
          active: boolean | null
          archetype: string
          created_at: string
          daily_reps: string | null
          failure_mode: string | null
          id: string
          label: string
          metrics: string | null
          skills: string | null
          sort_order: number | null
          standard: string | null
          target: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean | null
          archetype: string
          created_at?: string
          daily_reps?: string | null
          failure_mode?: string | null
          id?: string
          label: string
          metrics?: string | null
          skills?: string | null
          sort_order?: number | null
          standard?: string | null
          target?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean | null
          archetype?: string
          created_at?: string
          daily_reps?: string | null
          failure_mode?: string | null
          id?: string
          label?: string
          metrics?: string | null
          skills?: string | null
          sort_order?: number | null
          standard?: string | null
          target?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      thread_milestones: {
        Row: {
          capability_focus: string | null
          created_at: string
          description: string | null
          id: string
          insights_connected: number | null
          month_number: number
          status: string | null
          title: string
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          capability_focus?: string | null
          created_at?: string
          description?: string | null
          id?: string
          insights_connected?: number | null
          month_number: number
          status?: string | null
          title: string
          updated_at?: string
          user_id: string
          year?: number
        }
        Update: {
          capability_focus?: string | null
          created_at?: string
          description?: string | null
          id?: string
          insights_connected?: number | null
          month_number?: number
          status?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          year?: number
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
      weekly_intentions: {
        Row: {
          completed: boolean | null
          created_at: string
          day_of_week: number | null
          id: string
          pillar: string | null
          sort_order: number | null
          text: string
          user_id: string
          week_number: number
          year: number
        }
        Insert: {
          completed?: boolean | null
          created_at?: string
          day_of_week?: number | null
          id?: string
          pillar?: string | null
          sort_order?: number | null
          text: string
          user_id: string
          week_number: number
          year: number
        }
        Update: {
          completed?: boolean | null
          created_at?: string
          day_of_week?: number | null
          id?: string
          pillar?: string | null
          sort_order?: number | null
          text?: string
          user_id?: string
          week_number?: number
          year?: number
        }
        Relationships: []
      }
      weekly_pillar_targets: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          pillar: string
          priority: number
          updated_at: string
          user_id: string
          weekly_target: number
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          pillar: string
          priority?: number
          updated_at?: string
          user_id: string
          weekly_target?: number
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          pillar?: string
          priority?: number
          updated_at?: string
          user_id?: string
          weekly_target?: number
        }
        Relationships: []
      }
      weekly_rhythm: {
        Row: {
          created_at: string
          deep_work_blocks: string | null
          gym_blocks: string | null
          id: string
          meal_pattern: string | null
          notes: string | null
          sleep_target: string | null
          social_blocks: string | null
          updated_at: string
          user_id: string
          weekend_pattern: string | null
          work_hours: string | null
        }
        Insert: {
          created_at?: string
          deep_work_blocks?: string | null
          gym_blocks?: string | null
          id?: string
          meal_pattern?: string | null
          notes?: string | null
          sleep_target?: string | null
          social_blocks?: string | null
          updated_at?: string
          user_id: string
          weekend_pattern?: string | null
          work_hours?: string | null
        }
        Update: {
          created_at?: string
          deep_work_blocks?: string | null
          gym_blocks?: string | null
          id?: string
          meal_pattern?: string | null
          notes?: string | null
          sleep_target?: string | null
          social_blocks?: string | null
          updated_at?: string
          user_id?: string
          weekend_pattern?: string | null
          work_hours?: string | null
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
