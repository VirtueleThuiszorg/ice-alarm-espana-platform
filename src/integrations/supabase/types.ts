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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          staff_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          staff_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      admin_ideas: {
        Row: {
          category: string
          completed: boolean
          content: string | null
          created_at: string
          id: string
          is_checklist: boolean
          position: number
          priority: string
          staff_id: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          completed?: boolean
          content?: string | null
          created_at?: string
          id?: string
          is_checklist?: boolean
          position?: number
          priority?: string
          staff_id: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          completed?: boolean
          content?: string | null
          created_at?: string
          id?: string
          is_checklist?: boolean
          position?: number
          priority?: string
          staff_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_ideas_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_ideas_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      ai_actions: {
        Row: {
          action_type: string
          created_at: string | null
          error_message: string | null
          executed_at: string | null
          executed_by: string | null
          id: string
          payload: Json
          result: Json | null
          run_id: string | null
          status: string | null
        }
        Insert: {
          action_type: string
          created_at?: string | null
          error_message?: string | null
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          payload: Json
          result?: Json | null
          run_id?: string | null
          status?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string | null
          error_message?: string | null
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          payload?: Json
          result?: Json | null
          run_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_actions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_configs: {
        Row: {
          agent_id: string | null
          business_context: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          language_policy: Json | null
          read_permissions: Json | null
          system_instruction: string
          tool_policy: Json | null
          triggers: Json | null
          version: number | null
          write_permissions: Json | null
        }
        Insert: {
          agent_id?: string | null
          business_context?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          language_policy?: Json | null
          read_permissions?: Json | null
          system_instruction: string
          tool_policy?: Json | null
          triggers?: Json | null
          version?: number | null
          write_permissions?: Json | null
        }
        Update: {
          agent_id?: string | null
          business_context?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          language_policy?: Json | null
          read_permissions?: Json | null
          system_instruction?: string
          tool_policy?: Json | null
          triggers?: Json | null
          version?: number | null
          write_permissions?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_configs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          agent_key: string
          avatar_url: string | null
          created_at: string | null
          description: string | null
          enabled: boolean | null
          id: string
          instance_count: number | null
          mode: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          agent_key: string
          avatar_url?: string | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          id?: string
          instance_count?: number | null
          mode?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          agent_key?: string
          avatar_url?: string | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          id?: string
          instance_count?: number | null
          mode?: string | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_events: {
        Row: {
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          payload: Json | null
          processed: boolean | null
          processed_at: string | null
        }
        Insert: {
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
        }
        Update: {
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
        }
        Relationships: []
      }
      ai_memory: {
        Row: {
          agent_id: string | null
          content: string
          created_at: string | null
          id: string
          importance: number | null
          scope: string
          scope_id: string | null
          tags: string[] | null
          title: string
        }
        Insert: {
          agent_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          importance?: number | null
          scope: string
          scope_id?: string | null
          tags?: string[] | null
          title: string
        }
        Update: {
          agent_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          importance?: number | null
          scope?: string
          scope_id?: string | null
          tags?: string[] | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_memory_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_runs: {
        Row: {
          agent_id: string | null
          created_at: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          input_context: Json | null
          model_used: string | null
          output: Json | null
          status: string | null
          tokens_used: number | null
          trigger_event_id: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_context?: Json | null
          model_used?: string | null
          output?: Json | null
          status?: string | null
          tokens_used?: number | null
          trigger_event_id?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_context?: Json | null
          model_used?: string | null
          output?: Json | null
          status?: string | null
          tokens_used?: number | null
          trigger_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_runs_trigger_event_id_fkey"
            columns: ["trigger_event_id"]
            isOneToOne: false
            referencedRelation: "ai_events"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_communications: {
        Row: {
          alert_id: string
          communication_type: Database["public"]["Enums"]["communication_type"]
          created_at: string | null
          direction: Database["public"]["Enums"]["communication_direction"]
          duration_seconds: number | null
          id: string
          message_content: string | null
          notes: string | null
          recipient_phone: string
          recipient_type: Database["public"]["Enums"]["recipient_type"]
          recording_url: string | null
          staff_id: string | null
          twilio_sid: string | null
        }
        Insert: {
          alert_id: string
          communication_type: Database["public"]["Enums"]["communication_type"]
          created_at?: string | null
          direction: Database["public"]["Enums"]["communication_direction"]
          duration_seconds?: number | null
          id?: string
          message_content?: string | null
          notes?: string | null
          recipient_phone: string
          recipient_type: Database["public"]["Enums"]["recipient_type"]
          recording_url?: string | null
          staff_id?: string | null
          twilio_sid?: string | null
        }
        Update: {
          alert_id?: string
          communication_type?: Database["public"]["Enums"]["communication_type"]
          created_at?: string | null
          direction?: Database["public"]["Enums"]["communication_direction"]
          duration_seconds?: number | null
          id?: string
          message_content?: string | null
          notes?: string | null
          recipient_phone?: string
          recipient_type?: Database["public"]["Enums"]["recipient_type"]
          recording_url?: string | null
          staff_id?: string | null
          twilio_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_communications_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_communications_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_communications_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      alert_escalations: {
        Row: {
          alert_id: string
          attempted_at: string
          escalation_level: number
          id: string
          responded: boolean
          responded_at: string | null
          response_method: string | null
          target_phone: string | null
          target_staff_id: string | null
          target_type: Database["public"]["Enums"]["escalation_target_type"]
        }
        Insert: {
          alert_id: string
          attempted_at?: string
          escalation_level: number
          id?: string
          responded?: boolean
          responded_at?: string | null
          response_method?: string | null
          target_phone?: string | null
          target_staff_id?: string | null
          target_type: Database["public"]["Enums"]["escalation_target_type"]
        }
        Update: {
          alert_id?: string
          attempted_at?: string
          escalation_level?: number
          id?: string
          responded?: boolean
          responded_at?: string | null
          response_method?: string | null
          target_phone?: string | null
          target_staff_id?: string | null
          target_type?: Database["public"]["Enums"]["escalation_target_type"]
        }
        Relationships: [
          {
            foreignKeyName: "alert_escalations_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_escalations_target_staff_id_fkey"
            columns: ["target_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_escalations_target_staff_id_fkey"
            columns: ["target_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      alerts: {
        Row: {
          accepted_at: string | null
          accepted_by_staff_id: string | null
          alert_type: Database["public"]["Enums"]["alert_type"]
          claimed_at: string | null
          claimed_by: string | null
          conference_id: string | null
          device_id: string | null
          emergency_services_called: boolean | null
          escalation_level_reached: number | null
          id: string
          is_false_alarm: boolean | null
          is_unresponsive: boolean | null
          location_address: string | null
          location_lat: number | null
          location_lng: number | null
          member_id: string
          message: string | null
          next_of_kin_notified: boolean | null
          received_at: string | null
          resolution_notes: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["alert_status"] | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_staff_id?: string | null
          alert_type: Database["public"]["Enums"]["alert_type"]
          claimed_at?: string | null
          claimed_by?: string | null
          conference_id?: string | null
          device_id?: string | null
          emergency_services_called?: boolean | null
          escalation_level_reached?: number | null
          id?: string
          is_false_alarm?: boolean | null
          is_unresponsive?: boolean | null
          location_address?: string | null
          location_lat?: number | null
          location_lng?: number | null
          member_id: string
          message?: string | null
          next_of_kin_notified?: boolean | null
          received_at?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["alert_status"] | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by_staff_id?: string | null
          alert_type?: Database["public"]["Enums"]["alert_type"]
          claimed_at?: string | null
          claimed_by?: string | null
          conference_id?: string | null
          device_id?: string | null
          emergency_services_called?: boolean | null
          escalation_level_reached?: number | null
          id?: string
          is_false_alarm?: boolean | null
          is_unresponsive?: boolean | null
          location_address?: string | null
          location_lat?: number | null
          location_lng?: number | null
          member_id?: string
          message?: string | null
          next_of_kin_notified?: boolean | null
          received_at?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["alert_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_accepted_by_staff_id_fkey"
            columns: ["accepted_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_accepted_by_staff_id_fkey"
            columns: ["accepted_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "alerts_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "alerts_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conference_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          ai_intro: string | null
          content: string
          created_at: string | null
          excerpt: string | null
          facebook_post_id: string | null
          id: string
          image_url: string | null
          language: string | null
          published: boolean | null
          published_at: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          social_post_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          ai_intro?: string | null
          content: string
          created_at?: string | null
          excerpt?: string | null
          facebook_post_id?: string | null
          id?: string
          image_url?: string | null
          language?: string | null
          published?: boolean | null
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          social_post_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          ai_intro?: string | null
          content?: string
          created_at?: string | null
          excerpt?: string | null
          facebook_post_id?: string | null
          id?: string
          image_url?: string | null
          language?: string | null
          published?: boolean | null
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          social_post_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_social_post_id_fkey"
            columns: ["social_post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      conference_participants: {
        Row: {
          conference_id: string
          emergency_contact_id: string | null
          id: string
          is_muted: boolean
          join_method: Database["public"]["Enums"]["participant_join_method"]
          joined_at: string
          left_at: string | null
          participant_name: string
          participant_type: Database["public"]["Enums"]["participant_type"]
          phone_number: string | null
          staff_id: string | null
          twilio_call_sid: string | null
        }
        Insert: {
          conference_id: string
          emergency_contact_id?: string | null
          id?: string
          is_muted?: boolean
          join_method?: Database["public"]["Enums"]["participant_join_method"]
          joined_at?: string
          left_at?: string | null
          participant_name: string
          participant_type: Database["public"]["Enums"]["participant_type"]
          phone_number?: string | null
          staff_id?: string | null
          twilio_call_sid?: string | null
        }
        Update: {
          conference_id?: string
          emergency_contact_id?: string | null
          id?: string
          is_muted?: boolean
          join_method?: Database["public"]["Enums"]["participant_join_method"]
          joined_at?: string
          left_at?: string | null
          participant_name?: string
          participant_type?: Database["public"]["Enums"]["participant_type"]
          phone_number?: string | null
          staff_id?: string | null
          twilio_call_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conference_participants_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conference_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conference_participants_emergency_contact_id_fkey"
            columns: ["emergency_contact_id"]
            isOneToOne: false
            referencedRelation: "emergency_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conference_participants_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conference_participants_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      conference_rooms: {
        Row: {
          alert_id: string
          conference_name: string
          created_at: string
          ended_at: string | null
          id: string
          recording_duration_seconds: number | null
          recording_url: string | null
          status: string
          twilio_conference_sid: string | null
        }
        Insert: {
          alert_id: string
          conference_name: string
          created_at?: string
          ended_at?: string | null
          id?: string
          recording_duration_seconds?: number | null
          recording_url?: string | null
          status?: string
          twilio_conference_sid?: string | null
        }
        Update: {
          alert_id?: string
          conference_name?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          recording_duration_seconds?: number | null
          recording_url?: string | null
          status?: string
          twilio_conference_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conference_rooms_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_calls: {
        Row: {
          call_sid: string | null
          conversation_id: string
          created_at: string | null
          direction: string | null
          ended_at: string | null
          from_number: string | null
          id: string
          recording_url: string | null
          started_at: string | null
          status: string | null
          to_number: string | null
        }
        Insert: {
          call_sid?: string | null
          conversation_id: string
          created_at?: string | null
          direction?: string | null
          ended_at?: string | null
          from_number?: string | null
          id?: string
          recording_url?: string | null
          started_at?: string | null
          status?: string | null
          to_number?: string | null
        }
        Update: {
          call_sid?: string | null
          conversation_id?: string
          created_at?: string | null
          direction?: string | null
          ended_at?: string | null
          from_number?: string | null
          id?: string
          recording_url?: string | null
          started_at?: string | null
          status?: string | null
          to_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          channel: string
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          meta: Json | null
          role: string
        }
        Insert: {
          channel: string
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          meta?: Json | null
          role: string
        }
        Update: {
          channel?: string
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          meta?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_to: string | null
          conversation_type: string | null
          created_at: string | null
          id: string
          language: string | null
          last_channel: string | null
          last_message_at: string | null
          lead_id: string | null
          member_id: string | null
          priority: string | null
          source: string | null
          staff_participants: string[] | null
          status: string | null
          subject: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          conversation_type?: string | null
          created_at?: string | null
          id?: string
          language?: string | null
          last_channel?: string | null
          last_message_at?: string | null
          lead_id?: string | null
          member_id?: string | null
          priority?: string | null
          source?: string | null
          staff_participants?: string[] | null
          status?: string | null
          subject?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          conversation_type?: string | null
          created_at?: string | null
          id?: string
          language?: string | null
          last_channel?: string | null
          last_message_at?: string | null
          lead_id?: string | null
          member_id?: string | null
          priority?: string | null
          source?: string | null
          staff_participants?: string[] | null
          status?: string | null
          subject?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "conversations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contacts: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          assigned_to_staff_id: string | null
          city: string | null
          country: string | null
          created_at: string
          email_primary: string | null
          first_name: string | null
          full_name: string | null
          groups: string[] | null
          id: string
          last_name: string | null
          last_synced_at: string | null
          linked_member_id: string | null
          notes: string | null
          phone_primary: string | null
          postal_code: string | null
          province: string | null
          referral_source: string | null
          source: string
          stage: string | null
          status: string | null
          tags: string[] | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          assigned_to_staff_id?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email_primary?: string | null
          first_name?: string | null
          full_name?: string | null
          groups?: string[] | null
          id?: string
          last_name?: string | null
          last_synced_at?: string | null
          linked_member_id?: string | null
          notes?: string | null
          phone_primary?: string | null
          postal_code?: string | null
          province?: string | null
          referral_source?: string | null
          source?: string
          stage?: string | null
          status?: string | null
          tags?: string[] | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          assigned_to_staff_id?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email_primary?: string | null
          first_name?: string | null
          full_name?: string | null
          groups?: string[] | null
          id?: string
          last_name?: string | null
          last_synced_at?: string | null
          linked_member_id?: string | null
          notes?: string | null
          phone_primary?: string | null
          postal_code?: string | null
          province?: string | null
          referral_source?: string | null
          source?: string
          stage?: string | null
          status?: string | null
          tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_assigned_to_staff_id_fkey"
            columns: ["assigned_to_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_assigned_to_staff_id_fkey"
            columns: ["assigned_to_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "crm_contacts_linked_member_id_fkey"
            columns: ["linked_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          payload?: Json
          processed_at?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
        }
        Relationships: []
      }
      crm_import_batches: {
        Row: {
          created_at: string
          created_by: string | null
          failed_rows: number
          filename: string
          id: string
          imported_rows: number
          notes: string | null
          skipped_rows: number
          source: string
          status: Database["public"]["Enums"]["import_batch_status"]
          total_rows: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          failed_rows?: number
          filename: string
          id?: string
          imported_rows?: number
          notes?: string | null
          skipped_rows?: number
          source?: string
          status?: Database["public"]["Enums"]["import_batch_status"]
          total_rows?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          failed_rows?: number
          filename?: string
          id?: string
          imported_rows?: number
          notes?: string | null
          skipped_rows?: number
          source?: string
          status?: Database["public"]["Enums"]["import_batch_status"]
          total_rows?: number
        }
        Relationships: []
      }
      crm_import_rows: {
        Row: {
          batch_id: string
          created_at: string
          dedupe_key: string | null
          error_message: string | null
          id: string
          import_status: Database["public"]["Enums"]["import_row_status"]
          import_target: Database["public"]["Enums"]["import_row_target"] | null
          imported_crm_contact_id: string | null
          imported_member_id: string | null
          parsed_city: string | null
          parsed_country: string | null
          parsed_device_imei: string | null
          parsed_email_primary: string | null
          parsed_first_name: string | null
          parsed_full_name: string | null
          parsed_last_name: string | null
          parsed_membership_type: string | null
          parsed_notes: string | null
          parsed_phone_primary: string | null
          parsed_postal_code: string | null
          parsed_referral_source: string | null
          parsed_stage: string | null
          parsed_status: string | null
          raw: Json
          row_index: number
        }
        Insert: {
          batch_id: string
          created_at?: string
          dedupe_key?: string | null
          error_message?: string | null
          id?: string
          import_status?: Database["public"]["Enums"]["import_row_status"]
          import_target?:
            | Database["public"]["Enums"]["import_row_target"]
            | null
          imported_crm_contact_id?: string | null
          imported_member_id?: string | null
          parsed_city?: string | null
          parsed_country?: string | null
          parsed_device_imei?: string | null
          parsed_email_primary?: string | null
          parsed_first_name?: string | null
          parsed_full_name?: string | null
          parsed_last_name?: string | null
          parsed_membership_type?: string | null
          parsed_notes?: string | null
          parsed_phone_primary?: string | null
          parsed_postal_code?: string | null
          parsed_referral_source?: string | null
          parsed_stage?: string | null
          parsed_status?: string | null
          raw: Json
          row_index: number
        }
        Update: {
          batch_id?: string
          created_at?: string
          dedupe_key?: string | null
          error_message?: string | null
          id?: string
          import_status?: Database["public"]["Enums"]["import_row_status"]
          import_target?:
            | Database["public"]["Enums"]["import_row_target"]
            | null
          imported_crm_contact_id?: string | null
          imported_member_id?: string | null
          parsed_city?: string | null
          parsed_country?: string | null
          parsed_device_imei?: string | null
          parsed_email_primary?: string | null
          parsed_first_name?: string | null
          parsed_full_name?: string | null
          parsed_last_name?: string | null
          parsed_membership_type?: string | null
          parsed_notes?: string | null
          parsed_phone_primary?: string | null
          parsed_postal_code?: string | null
          parsed_referral_source?: string | null
          parsed_stage?: string | null
          parsed_status?: string | null
          raw?: Json
          row_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "crm_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_import_rows_imported_crm_contact_id_fkey"
            columns: ["imported_crm_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_import_rows_imported_member_id_fkey"
            columns: ["imported_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_profiles: {
        Row: {
          assigned_to_staff_id: string | null
          department: string | null
          groups: string[] | null
          industry: string | null
          member_id: string
          referral_source: string | null
          stage: string | null
          status: string | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          assigned_to_staff_id?: string | null
          department?: string | null
          groups?: string[] | null
          industry?: string | null
          member_id: string
          referral_source?: string | null
          stage?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          assigned_to_staff_id?: string | null
          department?: string | null
          groups?: string[] | null
          industry?: string | null
          member_id?: string
          referral_source?: string | null
          stage?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_profiles_assigned_to_staff_id_fkey"
            columns: ["assigned_to_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_profiles_assigned_to_staff_id_fkey"
            columns: ["assigned_to_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "crm_profiles_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          assigned_at: string | null
          battery_level: number | null
          collected_at: string | null
          collected_by_staff_id: string | null
          configuration_status:
            | Database["public"]["Enums"]["device_config_status"]
            | null
          created_at: string | null
          device_type: string | null
          id: string
          imei: string
          is_online: boolean | null
          last_checkin_at: string | null
          last_location_address: string | null
          last_location_lat: number | null
          last_location_lng: number | null
          live_at: string | null
          member_id: string | null
          model: string | null
          notes: string | null
          offline_since: string | null
          purchased_at: string | null
          reserved_at: string | null
          reserved_order_id: string | null
          serial_number: string | null
          sim_iccid: string | null
          sim_phone_number: string
          status: Database["public"]["Enums"]["device_status"] | null
        }
        Insert: {
          assigned_at?: string | null
          battery_level?: number | null
          collected_at?: string | null
          collected_by_staff_id?: string | null
          configuration_status?:
            | Database["public"]["Enums"]["device_config_status"]
            | null
          created_at?: string | null
          device_type?: string | null
          id?: string
          imei: string
          is_online?: boolean | null
          last_checkin_at?: string | null
          last_location_address?: string | null
          last_location_lat?: number | null
          last_location_lng?: number | null
          live_at?: string | null
          member_id?: string | null
          model?: string | null
          notes?: string | null
          offline_since?: string | null
          purchased_at?: string | null
          reserved_at?: string | null
          reserved_order_id?: string | null
          serial_number?: string | null
          sim_iccid?: string | null
          sim_phone_number: string
          status?: Database["public"]["Enums"]["device_status"] | null
        }
        Update: {
          assigned_at?: string | null
          battery_level?: number | null
          collected_at?: string | null
          collected_by_staff_id?: string | null
          configuration_status?:
            | Database["public"]["Enums"]["device_config_status"]
            | null
          created_at?: string | null
          device_type?: string | null
          id?: string
          imei?: string
          is_online?: boolean | null
          last_checkin_at?: string | null
          last_location_address?: string | null
          last_location_lat?: number | null
          last_location_lng?: number | null
          live_at?: string | null
          member_id?: string | null
          model?: string | null
          notes?: string | null
          offline_since?: string | null
          purchased_at?: string | null
          reserved_at?: string | null
          reserved_order_id?: string | null
          serial_number?: string | null
          sim_iccid?: string | null
          sim_phone_number?: string
          status?: Database["public"]["Enums"]["device_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "devices_collected_by_staff_id_fkey"
            columns: ["collected_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devices_collected_by_staff_id_fkey"
            columns: ["collected_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "devices_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devices_reserved_order_id_fkey"
            columns: ["reserved_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      documentation: {
        Row: {
          category: Database["public"]["Enums"]["documentation_category"]
          content: string
          created_at: string
          created_by: string | null
          id: string
          importance: number
          language: string
          slug: string
          status: Database["public"]["Enums"]["documentation_status"]
          tags: string[]
          title: string
          updated_at: string
          updated_by: string | null
          version: number
          visibility: string[]
        }
        Insert: {
          category?: Database["public"]["Enums"]["documentation_category"]
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          importance?: number
          language?: string
          slug: string
          status?: Database["public"]["Enums"]["documentation_status"]
          tags?: string[]
          title: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          visibility?: string[]
        }
        Update: {
          category?: Database["public"]["Enums"]["documentation_category"]
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          importance?: number
          language?: string
          slug?: string
          status?: Database["public"]["Enums"]["documentation_status"]
          tags?: string[]
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          visibility?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "documentation_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentation_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "documentation_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentation_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      email_log: {
        Row: {
          body_html: string
          body_text: string | null
          created_at: string
          error_message: string | null
          from_email: string
          headers_json: Json | null
          id: string
          module: string
          provider_message_id: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          sent_at: string | null
          status: string
          subject: string
          template_id: string | null
          to_email: string
        }
        Insert: {
          body_html: string
          body_text?: string | null
          created_at?: string
          error_message?: string | null
          from_email: string
          headers_json?: Json | null
          id?: string
          module: string
          provider_message_id?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          template_id?: string | null
          to_email: string
        }
        Update: {
          body_html?: string
          body_text?: string | null
          created_at?: string
          error_message?: string | null
          from_email?: string
          headers_json?: Json | null
          id?: string
          module?: string
          provider_message_id?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          template_id?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_log_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_settings: {
        Row: {
          created_at: string
          daily_send_limit: number
          enable_member_emails: boolean
          enable_outreach_emails: boolean
          enable_system_emails: boolean
          from_email: string | null
          from_name: string | null
          gmail_access_token: string | null
          gmail_connected: boolean
          gmail_connected_email: string | null
          gmail_last_sync_at: string | null
          gmail_mode: string | null
          gmail_refresh_token: string | null
          gmail_smtp_host: string | null
          gmail_smtp_password_secret_name: string | null
          gmail_smtp_port: number | null
          gmail_smtp_user: string | null
          gmail_token_expires_at: string | null
          hourly_send_limit: number
          id: string
          provider: string
          reply_to_email: string | null
          signature_html: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_send_limit?: number
          enable_member_emails?: boolean
          enable_outreach_emails?: boolean
          enable_system_emails?: boolean
          from_email?: string | null
          from_name?: string | null
          gmail_access_token?: string | null
          gmail_connected?: boolean
          gmail_connected_email?: string | null
          gmail_last_sync_at?: string | null
          gmail_mode?: string | null
          gmail_refresh_token?: string | null
          gmail_smtp_host?: string | null
          gmail_smtp_password_secret_name?: string | null
          gmail_smtp_port?: number | null
          gmail_smtp_user?: string | null
          gmail_token_expires_at?: string | null
          hourly_send_limit?: number
          id?: string
          provider?: string
          reply_to_email?: string | null
          signature_html?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_send_limit?: number
          enable_member_emails?: boolean
          enable_outreach_emails?: boolean
          enable_system_emails?: boolean
          from_email?: string | null
          from_name?: string | null
          gmail_access_token?: string | null
          gmail_connected?: boolean
          gmail_connected_email?: string | null
          gmail_last_sync_at?: string | null
          gmail_mode?: string | null
          gmail_refresh_token?: string | null
          gmail_smtp_host?: string | null
          gmail_smtp_password_secret_name?: string | null
          gmail_smtp_port?: number | null
          gmail_smtp_user?: string | null
          gmail_token_expires_at?: string | null
          hourly_send_limit?: number
          id?: string
          provider?: string
          reply_to_email?: string | null
          signature_html?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body_html_en: string
          body_html_es: string
          body_text_en: string | null
          body_text_es: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          module: string
          name: string
          slug: string
          subject_en: string
          subject_es: string
          updated_at: string
          variables: Json | null
        }
        Insert: {
          body_html_en: string
          body_html_es: string
          body_text_en?: string | null
          body_text_es?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          module: string
          name: string
          slug: string
          subject_en: string
          subject_es: string
          updated_at?: string
          variables?: Json | null
        }
        Update: {
          body_html_en?: string
          body_html_es?: string
          body_text_en?: string | null
          body_text_es?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          module?: string
          name?: string
          slug?: string
          subject_en?: string
          subject_es?: string
          updated_at?: string
          variables?: Json | null
        }
        Relationships: []
      }
      emergency_contacts: {
        Row: {
          contact_name: string
          created_at: string | null
          email: string | null
          id: string
          is_primary: boolean | null
          member_id: string
          notes: string | null
          phone: string
          priority_order: number
          relationship: string
          speaks_spanish: boolean | null
        }
        Insert: {
          contact_name: string
          created_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          member_id: string
          notes?: string | null
          phone: string
          priority_order: number
          relationship: string
          speaks_spanish?: boolean | null
        }
        Update: {
          contact_name?: string
          created_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          member_id?: string
          notes?: string | null
          phone?: string
          priority_order?: number
          relationship?: string
          speaks_spanish?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "emergency_contacts_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_email_log: {
        Row: {
          body_html: string | null
          body_snippet: string | null
          created_at: string
          from_email: string
          id: string
          is_reply: boolean | null
          linked_entity_id: string | null
          linked_entity_type: string | null
          module_matched: string | null
          original_email_log_id: string | null
          processed_at: string | null
          provider_message_id: string | null
          provider_thread_id: string | null
          received_at: string
          subject: string | null
          to_email: string
        }
        Insert: {
          body_html?: string | null
          body_snippet?: string | null
          created_at?: string
          from_email: string
          id?: string
          is_reply?: boolean | null
          linked_entity_id?: string | null
          linked_entity_type?: string | null
          module_matched?: string | null
          original_email_log_id?: string | null
          processed_at?: string | null
          provider_message_id?: string | null
          provider_thread_id?: string | null
          received_at: string
          subject?: string | null
          to_email: string
        }
        Update: {
          body_html?: string | null
          body_snippet?: string | null
          created_at?: string
          from_email?: string
          id?: string
          is_reply?: boolean | null
          linked_entity_id?: string | null
          linked_entity_type?: string | null
          module_matched?: string | null
          original_email_log_id?: string | null
          processed_at?: string | null
          provider_message_id?: string | null
          provider_thread_id?: string | null
          received_at?: string
          subject?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_email_log_original_email_log_id_fkey"
            columns: ["original_email_log_id"]
            isOneToOne: false
            referencedRelation: "email_log"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_tickets: {
        Row: {
          assigned_to: string | null
          category: Database["public"]["Enums"]["ticket_category"]
          created_at: string
          created_by: string
          description: string
          id: string
          member_id: string | null
          priority: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_number: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["ticket_category"]
          created_at?: string
          created_by: string
          description: string
          id?: string
          member_id?: string | null
          priority?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_number: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["ticket_category"]
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          member_id?: string | null
          priority?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_number?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "internal_tickets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_tickets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "internal_tickets_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      isabella_assessment_notes: {
        Row: {
          alert_id: string
          content: string
          id: string
          is_critical: boolean
          note_type: Database["public"]["Enums"]["isabella_note_type"]
          timestamp: string
        }
        Insert: {
          alert_id: string
          content: string
          id?: string
          is_critical?: boolean
          note_type: Database["public"]["Enums"]["isabella_note_type"]
          timestamp?: string
        }
        Update: {
          alert_id?: string
          content?: string
          id?: string
          is_critical?: boolean
          note_type?: Database["public"]["Enums"]["isabella_note_type"]
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "isabella_assessment_notes_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      isabella_settings: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          enabled_at: string | null
          enabled_by: string | null
          function_key: string
          id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          function_key: string
          id?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          function_key?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "isabella_settings_enabled_by_fkey"
            columns: ["enabled_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "isabella_settings_enabled_by_fkey"
            columns: ["enabled_by"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          contacted_at: string | null
          converted_at: string | null
          converted_member_id: string | null
          created_at: string
          email: string
          enquiry_type: string
          first_name: string
          id: string
          last_name: string
          message: string | null
          notes: string | null
          phone: string
          preferred_language: string
          ref_partner_id: string | null
          ref_post_id: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          contacted_at?: string | null
          converted_at?: string | null
          converted_member_id?: string | null
          created_at?: string
          email: string
          enquiry_type?: string
          first_name: string
          id?: string
          last_name: string
          message?: string | null
          notes?: string | null
          phone: string
          preferred_language?: string
          ref_partner_id?: string | null
          ref_post_id?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          contacted_at?: string | null
          converted_at?: string | null
          converted_member_id?: string | null
          created_at?: string
          email?: string
          enquiry_type?: string
          first_name?: string
          id?: string
          last_name?: string
          message?: string | null
          notes?: string | null
          phone?: string
          preferred_language?: string
          ref_partner_id?: string | null
          ref_post_id?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "leads_converted_member_id_fkey"
            columns: ["converted_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_ref_partner_id_fkey"
            columns: ["ref_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_ref_post_id_fkey"
            columns: ["ref_post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      media_audiences: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      media_content_calendar: {
        Row: {
          audience_id: string | null
          blog_post_id: string | null
          created_at: string
          facebook_post_id: string | null
          generated_at: string | null
          generated_blog_content: string | null
          generated_blog_intro: string | null
          generated_image_prompt: string | null
          generated_image_url: string | null
          generated_post_text: string | null
          generated_post_text_es: string | null
          goal_id: string | null
          id: string
          image_style_id: string | null
          is_approved: boolean | null
          is_disabled: boolean | null
          notes: string | null
          publish_error: string | null
          publish_to_blog: boolean | null
          publish_to_facebook: boolean | null
          publish_to_instagram: boolean | null
          published_at: string | null
          scheduled_date: string
          scheduled_time: string
          social_post_id: string | null
          status: string
          topic_id: string | null
          updated_at: string
        }
        Insert: {
          audience_id?: string | null
          blog_post_id?: string | null
          created_at?: string
          facebook_post_id?: string | null
          generated_at?: string | null
          generated_blog_content?: string | null
          generated_blog_intro?: string | null
          generated_image_prompt?: string | null
          generated_image_url?: string | null
          generated_post_text?: string | null
          generated_post_text_es?: string | null
          goal_id?: string | null
          id?: string
          image_style_id?: string | null
          is_approved?: boolean | null
          is_disabled?: boolean | null
          notes?: string | null
          publish_error?: string | null
          publish_to_blog?: boolean | null
          publish_to_facebook?: boolean | null
          publish_to_instagram?: boolean | null
          published_at?: string | null
          scheduled_date: string
          scheduled_time?: string
          social_post_id?: string | null
          status?: string
          topic_id?: string | null
          updated_at?: string
        }
        Update: {
          audience_id?: string | null
          blog_post_id?: string | null
          created_at?: string
          facebook_post_id?: string | null
          generated_at?: string | null
          generated_blog_content?: string | null
          generated_blog_intro?: string | null
          generated_image_prompt?: string | null
          generated_image_url?: string | null
          generated_post_text?: string | null
          generated_post_text_es?: string | null
          goal_id?: string | null
          id?: string
          image_style_id?: string | null
          is_approved?: boolean | null
          is_disabled?: boolean | null
          notes?: string | null
          publish_error?: string | null
          publish_to_blog?: boolean | null
          publish_to_facebook?: boolean | null
          publish_to_instagram?: boolean | null
          published_at?: string | null
          scheduled_date?: string
          scheduled_time?: string
          social_post_id?: string | null
          status?: string
          topic_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_content_calendar_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "media_audiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_content_calendar_blog_post_id_fkey"
            columns: ["blog_post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_content_calendar_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "media_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_content_calendar_image_style_id_fkey"
            columns: ["image_style_id"]
            isOneToOne: false
            referencedRelation: "media_image_styles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_content_calendar_social_post_id_fkey"
            columns: ["social_post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_content_calendar_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "media_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      media_goals: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      media_image_styles: {
        Row: {
          ai_prompt_hint: string | null
          created_at: string
          description: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          ai_prompt_hint?: string | null
          created_at?: string
          description: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          ai_prompt_hint?: string | null
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      media_publishing_history: {
        Row: {
          audience_id: string | null
          calendar_item_id: string | null
          created_at: string | null
          external_post_id: string | null
          goal_id: string | null
          id: string
          image_style_id: string | null
          image_url: string | null
          platform: string
          post_text: string | null
          published_at: string
          topic_id: string | null
        }
        Insert: {
          audience_id?: string | null
          calendar_item_id?: string | null
          created_at?: string | null
          external_post_id?: string | null
          goal_id?: string | null
          id?: string
          image_style_id?: string | null
          image_url?: string | null
          platform: string
          post_text?: string | null
          published_at?: string
          topic_id?: string | null
        }
        Update: {
          audience_id?: string | null
          calendar_item_id?: string | null
          created_at?: string | null
          external_post_id?: string | null
          goal_id?: string | null
          id?: string
          image_style_id?: string | null
          image_url?: string | null
          platform?: string
          post_text?: string | null
          published_at?: string
          topic_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_publishing_history_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "media_audiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_publishing_history_calendar_item_id_fkey"
            columns: ["calendar_item_id"]
            isOneToOne: false
            referencedRelation: "media_content_calendar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_publishing_history_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "media_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_publishing_history_image_style_id_fkey"
            columns: ["image_style_id"]
            isOneToOne: false
            referencedRelation: "media_image_styles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_publishing_history_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "media_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      media_schedule_settings: {
        Row: {
          active_days: Json
          anti_repetition_rules: Json
          created_at: string
          id: string
          posts_per_day: number
          updated_at: string
        }
        Insert: {
          active_days?: Json
          anti_repetition_rules?: Json
          created_at?: string
          id?: string
          posts_per_day?: number
          updated_at?: string
        }
        Update: {
          active_days?: Json
          anti_repetition_rules?: Json
          created_at?: string
          id?: string
          posts_per_day?: number
          updated_at?: string
        }
        Relationships: []
      }
      media_topic_goals: {
        Row: {
          goal_id: string
          topic_id: string
        }
        Insert: {
          goal_id: string
          topic_id: string
        }
        Update: {
          goal_id?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_topic_goals_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "media_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_topic_goals_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "media_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      media_topics: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      medical_information: {
        Row: {
          additional_notes: string | null
          allergies: string[] | null
          blood_type: string | null
          doctor_name: string | null
          doctor_phone: string | null
          hospital_preference: string | null
          id: string
          medical_conditions: string[] | null
          medications: string[] | null
          member_id: string
          updated_at: string | null
        }
        Insert: {
          additional_notes?: string | null
          allergies?: string[] | null
          blood_type?: string | null
          doctor_name?: string | null
          doctor_phone?: string | null
          hospital_preference?: string | null
          id?: string
          medical_conditions?: string[] | null
          medications?: string[] | null
          member_id: string
          updated_at?: string | null
        }
        Update: {
          additional_notes?: string | null
          allergies?: string[] | null
          blood_type?: string | null
          doctor_name?: string | null
          doctor_phone?: string | null
          hospital_preference?: string | null
          id?: string
          medical_conditions?: string[] | null
          medications?: string[] | null
          member_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_information_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_contact_methods: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          label: string | null
          member_id: string
          type: Database["public"]["Enums"]["contact_method_type"]
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          label?: string | null
          member_id: string
          type: Database["public"]["Enums"]["contact_method_type"]
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          label?: string | null
          member_id?: string
          type?: Database["public"]["Enums"]["contact_method_type"]
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_contact_methods_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_interactions: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          interaction_type: string
          member_id: string
          metadata: Json | null
          staff_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          interaction_type: string
          member_id: string
          metadata?: Json | null
          staff_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          interaction_type?: string
          member_id?: string
          metadata?: Json | null
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_interactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_interactions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_interactions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      member_notes: {
        Row: {
          content: string
          created_at: string | null
          followup_completed: boolean | null
          followup_date: string | null
          id: string
          is_pinned: boolean | null
          is_private: boolean | null
          member_id: string
          note_type: string | null
          staff_id: string | null
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          followup_completed?: boolean | null
          followup_date?: string | null
          id?: string
          is_pinned?: boolean | null
          is_private?: boolean | null
          member_id: string
          note_type?: string | null
          staff_id?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          followup_completed?: boolean | null
          followup_date?: string | null
          id?: string
          is_pinned?: boolean | null
          is_private?: boolean | null
          member_id?: string
          note_type?: string | null
          staff_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_notes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_notes_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_notes_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      member_update_tokens: {
        Row: {
          created_at: string | null
          created_by: string | null
          expires_at: string
          id: string
          member_id: string
          requested_fields: string[]
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          expires_at: string
          id?: string
          member_id: string
          requested_fields?: string[]
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string
          id?: string
          member_id?: string
          requested_fields?: string[]
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_update_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_update_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "member_update_tokens_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          address_line_1: string
          address_line_2: string | null
          city: string
          country: string | null
          courtesy_call_frequency: string | null
          courtesy_calls_enabled: boolean | null
          created_at: string | null
          date_of_birth: string
          email: string
          first_name: string
          id: string
          last_name: string
          next_courtesy_call_date: string | null
          nie_dni: string | null
          phone: string
          photo_url: string | null
          postal_code: string
          preferred_contact_method: string | null
          preferred_contact_time: string | null
          preferred_language:
            | Database["public"]["Enums"]["preferred_language"]
            | null
          province: string
          ref_partner_id: string | null
          ref_post_id: string | null
          special_instructions: string | null
          status: Database["public"]["Enums"]["member_status"] | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          address_line_1: string
          address_line_2?: string | null
          city: string
          country?: string | null
          courtesy_call_frequency?: string | null
          courtesy_calls_enabled?: boolean | null
          created_at?: string | null
          date_of_birth: string
          email: string
          first_name: string
          id?: string
          last_name: string
          next_courtesy_call_date?: string | null
          nie_dni?: string | null
          phone: string
          photo_url?: string | null
          postal_code: string
          preferred_contact_method?: string | null
          preferred_contact_time?: string | null
          preferred_language?:
            | Database["public"]["Enums"]["preferred_language"]
            | null
          province: string
          ref_partner_id?: string | null
          ref_post_id?: string | null
          special_instructions?: string | null
          status?: Database["public"]["Enums"]["member_status"] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          address_line_1?: string
          address_line_2?: string | null
          city?: string
          country?: string | null
          courtesy_call_frequency?: string | null
          courtesy_calls_enabled?: boolean | null
          created_at?: string | null
          date_of_birth?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          next_courtesy_call_date?: string | null
          nie_dni?: string | null
          phone?: string
          photo_url?: string | null
          postal_code?: string
          preferred_contact_method?: string | null
          preferred_contact_time?: string | null
          preferred_language?:
            | Database["public"]["Enums"]["preferred_language"]
            | null
          province?: string
          ref_partner_id?: string | null
          ref_post_id?: string | null
          special_instructions?: string | null
          status?: Database["public"]["Enums"]["member_status"] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "members_ref_partner_id_fkey"
            columns: ["ref_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_ref_post_id_fkey"
            columns: ["ref_post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          is_read: boolean | null
          message_type: string | null
          metadata: Json | null
          read_at: string | null
          sender_id: string | null
          sender_type: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message_type?: string | null
          metadata?: Json | null
          read_at?: string | null
          sender_id?: string | null
          sender_type: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message_type?: string | null
          metadata?: Json | null
          read_at?: string | null
          sender_id?: string | null
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          admin_user_id: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          error: string | null
          event_type: string
          id: string
          message: string | null
          provider_message_id: string | null
          status: string
        }
        Insert: {
          admin_user_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          event_type: string
          id?: string
          message?: string | null
          provider_message_id?: string | null
          status?: string
        }
        Update: {
          admin_user_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          event_type?: string
          id?: string
          message?: string | null
          provider_message_id?: string | null
          status?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          admin_user_id: string
          created_at: string | null
          id: string
          updated_at: string | null
          whatsapp_hot_sales: boolean | null
          whatsapp_number: string | null
          whatsapp_paid_sales: boolean | null
          whatsapp_partner_signup: boolean | null
          whatsapp_shift_alerts: boolean | null
        }
        Insert: {
          admin_user_id: string
          created_at?: string | null
          id?: string
          updated_at?: string | null
          whatsapp_hot_sales?: boolean | null
          whatsapp_number?: string | null
          whatsapp_paid_sales?: boolean | null
          whatsapp_partner_signup?: boolean | null
          whatsapp_shift_alerts?: boolean | null
        }
        Update: {
          admin_user_id?: string
          created_at?: string | null
          id?: string
          updated_at?: string | null
          whatsapp_hot_sales?: boolean | null
          whatsapp_number?: string | null
          whatsapp_paid_sales?: boolean | null
          whatsapp_partner_signup?: boolean | null
          whatsapp_shift_alerts?: boolean | null
        }
        Relationships: []
      }
      operational_costs: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["cost_category"]
          created_at: string
          due_date: string | null
          frequency: Database["public"]["Enums"]["cost_frequency"]
          id: string
          name: string
          notes: string | null
          paid_at: string | null
          status: Database["public"]["Enums"]["cost_status"]
          updated_at: string
        }
        Insert: {
          amount?: number
          category?: Database["public"]["Enums"]["cost_category"]
          created_at?: string
          due_date?: string | null
          frequency?: Database["public"]["Enums"]["cost_frequency"]
          id?: string
          name: string
          notes?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["cost_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["cost_category"]
          created_at?: string
          due_date?: string | null
          frequency?: Database["public"]["Enums"]["cost_frequency"]
          id?: string
          name?: string
          notes?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["cost_status"]
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          cost_price: number | null
          created_at: string | null
          description: string
          device_id: string | null
          id: string
          item_type: Database["public"]["Enums"]["order_item_type"]
          order_id: string
          product_id: string | null
          quantity: number | null
          tax_amount: number
          tax_rate: number
          total_price: number
          unit_price: number
        }
        Insert: {
          cost_price?: number | null
          created_at?: string | null
          description: string
          device_id?: string | null
          id?: string
          item_type: Database["public"]["Enums"]["order_item_type"]
          order_id: string
          product_id?: string | null
          quantity?: number | null
          tax_amount: number
          tax_rate: number
          total_price: number
          unit_price: number
        }
        Update: {
          cost_price?: number | null
          created_at?: string | null
          description?: string
          device_id?: string | null
          id?: string
          item_type?: Database["public"]["Enums"]["order_item_type"]
          order_id?: string
          product_id?: string | null
          quantity?: number | null
          tax_amount?: number
          tax_rate?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string | null
          delivered_at: string | null
          id: string
          member_id: string
          notes: string | null
          order_number: string
          ref_partner_id: string | null
          ref_post_id: string | null
          shipped_at: string | null
          shipping_address_line_1: string
          shipping_address_line_2: string | null
          shipping_amount: number | null
          shipping_city: string
          shipping_country: string | null
          shipping_postal_code: string
          shipping_province: string
          status: Database["public"]["Enums"]["order_status"] | null
          subtotal: number
          tax_amount: number
          total_amount: number
          tracking_number: string | null
        }
        Insert: {
          created_at?: string | null
          delivered_at?: string | null
          id?: string
          member_id: string
          notes?: string | null
          order_number: string
          ref_partner_id?: string | null
          ref_post_id?: string | null
          shipped_at?: string | null
          shipping_address_line_1: string
          shipping_address_line_2?: string | null
          shipping_amount?: number | null
          shipping_city: string
          shipping_country?: string | null
          shipping_postal_code: string
          shipping_province: string
          status?: Database["public"]["Enums"]["order_status"] | null
          subtotal: number
          tax_amount: number
          total_amount: number
          tracking_number?: string | null
        }
        Update: {
          created_at?: string | null
          delivered_at?: string | null
          id?: string
          member_id?: string
          notes?: string | null
          order_number?: string
          ref_partner_id?: string | null
          ref_post_id?: string | null
          shipped_at?: string | null
          shipping_address_line_1?: string
          shipping_address_line_2?: string | null
          shipping_amount?: number | null
          shipping_city?: string
          shipping_country?: string | null
          shipping_postal_code?: string
          shipping_province?: string
          status?: Database["public"]["Enums"]["order_status"] | null
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          tracking_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_ref_partner_id_fkey"
            columns: ["ref_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_ref_post_id_fkey"
            columns: ["ref_post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_campaigns: {
        Row: {
          conversions_count: number | null
          created_at: string | null
          days_between_emails: number | null
          default_language: string
          description: string | null
          email_sequence: Json | null
          email_tone: string
          emails_sent: number | null
          follow_up_enabled: boolean
          id: string
          leads_count: number | null
          max_emails_per_lead: number | null
          messaging_tone: string | null
          min_ai_score: number | null
          name: string
          outreach_goal: string
          pipeline_type: string
          replies_count: number | null
          status: string
          target_categories: string[] | null
          target_description: string | null
          target_locations: string[] | null
          updated_at: string | null
        }
        Insert: {
          conversions_count?: number | null
          created_at?: string | null
          days_between_emails?: number | null
          default_language?: string
          description?: string | null
          email_sequence?: Json | null
          email_tone?: string
          emails_sent?: number | null
          follow_up_enabled?: boolean
          id?: string
          leads_count?: number | null
          max_emails_per_lead?: number | null
          messaging_tone?: string | null
          min_ai_score?: number | null
          name: string
          outreach_goal?: string
          pipeline_type?: string
          replies_count?: number | null
          status?: string
          target_categories?: string[] | null
          target_description?: string | null
          target_locations?: string[] | null
          updated_at?: string | null
        }
        Update: {
          conversions_count?: number | null
          created_at?: string | null
          days_between_emails?: number | null
          default_language?: string
          description?: string | null
          email_sequence?: Json | null
          email_tone?: string
          emails_sent?: number | null
          follow_up_enabled?: boolean
          id?: string
          leads_count?: number | null
          max_emails_per_lead?: number | null
          messaging_tone?: string | null
          min_ai_score?: number | null
          name?: string
          outreach_goal?: string
          pipeline_type?: string
          replies_count?: number | null
          status?: string
          target_categories?: string[] | null
          target_description?: string | null
          target_locations?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      outreach_crm_leads: {
        Row: {
          ai_score: number | null
          assigned_ai_agent: string | null
          bounce_count: number
          campaign_id: string | null
          category: string | null
          company_name: string
          contact_name: string | null
          converted_at: string | null
          converted_to_member_id: string | null
          converted_to_partner_id: string | null
          created_at: string | null
          do_not_contact: boolean
          email: string | null
          email_count: number | null
          followup_count: number
          id: string
          last_contacted_at: string | null
          last_reply_at: string | null
          lawful_basis: string | null
          location: string | null
          next_followup_at: string | null
          personalization_hooks: Json | null
          phone: string | null
          pipeline_type: string
          raw_lead_id: string | null
          research_summary: string | null
          source: string
          status: string
          unsubscribe_token: string | null
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          ai_score?: number | null
          assigned_ai_agent?: string | null
          bounce_count?: number
          campaign_id?: string | null
          category?: string | null
          company_name: string
          contact_name?: string | null
          converted_at?: string | null
          converted_to_member_id?: string | null
          converted_to_partner_id?: string | null
          created_at?: string | null
          do_not_contact?: boolean
          email?: string | null
          email_count?: number | null
          followup_count?: number
          id?: string
          last_contacted_at?: string | null
          last_reply_at?: string | null
          lawful_basis?: string | null
          location?: string | null
          next_followup_at?: string | null
          personalization_hooks?: Json | null
          phone?: string | null
          pipeline_type?: string
          raw_lead_id?: string | null
          research_summary?: string | null
          source: string
          status?: string
          unsubscribe_token?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          ai_score?: number | null
          assigned_ai_agent?: string | null
          bounce_count?: number
          campaign_id?: string | null
          category?: string | null
          company_name?: string
          contact_name?: string | null
          converted_at?: string | null
          converted_to_member_id?: string | null
          converted_to_partner_id?: string | null
          created_at?: string | null
          do_not_contact?: boolean
          email?: string | null
          email_count?: number | null
          followup_count?: number
          id?: string
          last_contacted_at?: string | null
          last_reply_at?: string | null
          lawful_basis?: string | null
          location?: string | null
          next_followup_at?: string | null
          personalization_hooks?: Json | null
          phone?: string | null
          pipeline_type?: string
          raw_lead_id?: string | null
          research_summary?: string | null
          source?: string
          status?: string
          unsubscribe_token?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_outreach_crm_leads_campaign"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_crm_leads_raw_lead_id_fkey"
            columns: ["raw_lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_raw_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_daily_usage: {
        Row: {
          created_at: string
          id: string
          inbox_id: string | null
          updated_at: string
          usage_count: number
          usage_date: string
          usage_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          inbox_id?: string | null
          updated_at?: string
          usage_count?: number
          usage_date?: string
          usage_type: string
        }
        Update: {
          created_at?: string
          id?: string
          inbox_id?: string | null
          updated_at?: string
          usage_count?: number
          usage_date?: string
          usage_type?: string
        }
        Relationships: []
      }
      outreach_email_drafts: {
        Row: {
          approval_required: boolean
          auto_approved: boolean
          body_html: string | null
          body_text: string
          campaign_id: string | null
          created_at: string | null
          crm_lead_id: string
          draft_type: string
          external_message_id: string | null
          id: string
          scheduled_for: string | null
          sent_at: string | null
          sequence_number: number | null
          status: string
          subject: string
        }
        Insert: {
          approval_required?: boolean
          auto_approved?: boolean
          body_html?: string | null
          body_text: string
          campaign_id?: string | null
          created_at?: string | null
          crm_lead_id: string
          draft_type?: string
          external_message_id?: string | null
          id?: string
          scheduled_for?: string | null
          sent_at?: string | null
          sequence_number?: number | null
          status?: string
          subject: string
        }
        Update: {
          approval_required?: boolean
          auto_approved?: boolean
          body_html?: string | null
          body_text?: string
          campaign_id?: string | null
          created_at?: string | null
          crm_lead_id?: string
          draft_type?: string
          external_message_id?: string | null
          id?: string
          scheduled_for?: string | null
          sent_at?: string | null
          sequence_number?: number | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_email_drafts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_email_drafts_crm_lead_id_fkey"
            columns: ["crm_lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_email_threads: {
        Row: {
          ai_classification: string | null
          ai_suggested_reply: string | null
          created_at: string | null
          crm_lead_id: string
          direction: string
          id: string
          message_body: string
          requires_action: boolean | null
          resolved_at: string | null
          subject: string
          thread_id: string | null
        }
        Insert: {
          ai_classification?: string | null
          ai_suggested_reply?: string | null
          created_at?: string | null
          crm_lead_id: string
          direction: string
          id?: string
          message_body: string
          requires_action?: boolean | null
          resolved_at?: string | null
          subject: string
          thread_id?: string | null
        }
        Update: {
          ai_classification?: string | null
          ai_suggested_reply?: string | null
          created_at?: string | null
          crm_lead_id?: string
          direction?: string
          id?: string
          message_body?: string
          requires_action?: boolean | null
          resolved_at?: string | null
          subject?: string
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_email_threads_crm_lead_id_fkey"
            columns: ["crm_lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_queued_tasks: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          error_message: string | null
          id: string
          priority: number | null
          processed_at: string | null
          scheduled_for: string
          status: string
          task_type: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          error_message?: string | null
          id?: string
          priority?: number | null
          processed_at?: string | null
          scheduled_for?: string
          status?: string
          task_type: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          error_message?: string | null
          id?: string
          priority?: number | null
          processed_at?: string | null
          scheduled_for?: string
          status?: string
          task_type?: string
        }
        Relationships: []
      }
      outreach_raw_leads: {
        Row: {
          ai_rated_at: string | null
          ai_reasoning: string | null
          ai_score: number | null
          category: string | null
          company_name: string
          contact_name: string | null
          created_at: string | null
          discovered_at: string | null
          do_not_contact: boolean
          domain: string | null
          email: string | null
          enriched_at: string | null
          enrichment_data: Json | null
          id: string
          location: string | null
          notes: string | null
          phone: string | null
          pipeline_type: string
          raw_data: Json | null
          source: string
          status: string
          unsubscribe_token: string | null
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          ai_rated_at?: string | null
          ai_reasoning?: string | null
          ai_score?: number | null
          category?: string | null
          company_name: string
          contact_name?: string | null
          created_at?: string | null
          discovered_at?: string | null
          do_not_contact?: boolean
          domain?: string | null
          email?: string | null
          enriched_at?: string | null
          enrichment_data?: Json | null
          id?: string
          location?: string | null
          notes?: string | null
          phone?: string | null
          pipeline_type?: string
          raw_data?: Json | null
          source?: string
          status?: string
          unsubscribe_token?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          ai_rated_at?: string | null
          ai_reasoning?: string | null
          ai_score?: number | null
          category?: string | null
          company_name?: string
          contact_name?: string | null
          created_at?: string | null
          discovered_at?: string | null
          do_not_contact?: boolean
          domain?: string | null
          email?: string | null
          enriched_at?: string | null
          enrichment_data?: Json | null
          id?: string
          location?: string | null
          notes?: string | null
          phone?: string | null
          pipeline_type?: string
          raw_data?: Json | null
          source?: string
          status?: string
          unsubscribe_token?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      outreach_run_logs: {
        Row: {
          created_at: string
          dry_run: boolean
          errors: Json | null
          finished_at: string | null
          id: string
          run_type: string
          started_at: string
          steps: Json | null
          totals: Json | null
          triggered_by: string
        }
        Insert: {
          created_at?: string
          dry_run?: boolean
          errors?: Json | null
          finished_at?: string | null
          id?: string
          run_type: string
          started_at?: string
          steps?: Json | null
          totals?: Json | null
          triggered_by?: string
        }
        Update: {
          created_at?: string
          dry_run?: boolean
          errors?: Json | null
          finished_at?: string | null
          id?: string
          run_type?: string
          started_at?: string
          steps?: Json | null
          totals?: Json | null
          triggered_by?: string
        }
        Relationships: []
      }
      outreach_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      outreach_suppression: {
        Row: {
          created_at: string
          domain: string | null
          email: string
          id: string
          reason: string
          source: string
        }
        Insert: {
          created_at?: string
          domain?: string | null
          email: string
          id?: string
          reason: string
          source?: string
        }
        Update: {
          created_at?: string
          domain?: string | null
          email?: string
          id?: string
          reason?: string
          source?: string
        }
        Relationships: []
      }
      partner_admin_invites: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          expires_at: string
          id: string
          partner_id: string
          revoked_at: string | null
          status: string
          token: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          expires_at: string
          id?: string
          partner_id: string
          revoked_at?: string | null
          status?: string
          token: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string
          id?: string
          partner_id?: string
          revoked_at?: string | null
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_admin_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_admin_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "partner_admin_invites_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_agreements: {
        Row: {
          agreement_html: string
          confirmed_accept: boolean
          confirmed_read: boolean
          confirmed_understand: boolean
          created_at: string
          id: string
          ip_address: string | null
          partner_id: string
          signed_at: string
          signer_id_number: string
          signer_id_type: string
          signer_name: string
          user_agent: string | null
          version: string
        }
        Insert: {
          agreement_html: string
          confirmed_accept?: boolean
          confirmed_read?: boolean
          confirmed_understand?: boolean
          created_at?: string
          id?: string
          ip_address?: string | null
          partner_id: string
          signed_at?: string
          signer_id_number: string
          signer_id_type: string
          signer_name: string
          user_agent?: string | null
          version?: string
        }
        Update: {
          agreement_html?: string
          confirmed_accept?: boolean
          confirmed_read?: boolean
          confirmed_understand?: boolean
          created_at?: string
          id?: string
          ip_address?: string | null
          partner_id?: string
          signed_at?: string
          signer_id_number?: string
          signer_id_type?: string
          signer_name?: string
          user_agent?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_agreements_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_alert_notifications: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_id: string
          id: string
          member_id: string
          notification_method: string
          partner_id: string
          sent_at: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_id: string
          id?: string
          member_id: string
          notification_method: string
          partner_id: string
          sent_at?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_id?: string
          id?: string
          member_id?: string
          notification_method?: string
          partner_id?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_alert_notifications_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_alert_notifications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_alert_notifications_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_alert_subscriptions: {
        Row: {
          created_at: string | null
          id: string
          member_id: string
          notify_email: boolean | null
          notify_sms: boolean | null
          partner_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          member_id: string
          notify_email?: boolean | null
          notify_sms?: boolean | null
          partner_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          member_id?: string
          notify_email?: boolean | null
          notify_sms?: boolean | null
          partner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_alert_subscriptions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_alert_subscriptions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_attributions: {
        Row: {
          created_at: string
          first_touch_at: string
          id: string
          last_touch_at: string
          member_id: string
          metadata: Json | null
          partner_id: string
          ref_param: string | null
          source: string
        }
        Insert: {
          created_at?: string
          first_touch_at?: string
          id?: string
          last_touch_at?: string
          member_id: string
          metadata?: Json | null
          partner_id: string
          ref_param?: string | null
          source: string
        }
        Update: {
          created_at?: string
          first_touch_at?: string
          id?: string
          last_touch_at?: string
          member_id?: string
          metadata?: Json | null
          partner_id?: string
          ref_param?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_attributions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_attributions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_clicks: {
        Row: {
          created_at: string | null
          id: string
          ip_hash: string | null
          link_id: string | null
          partner_id: string | null
          post_id: string | null
          referrer: string | null
          session_id: string | null
          ua_hash: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          ip_hash?: string | null
          link_id?: string | null
          partner_id?: string | null
          post_id?: string | null
          referrer?: string | null
          session_id?: string | null
          ua_hash?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          ip_hash?: string | null
          link_id?: string | null
          partner_id?: string | null
          post_id?: string | null
          referrer?: string | null
          session_id?: string | null
          ua_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_clicks_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "partner_post_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_clicks_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_clicks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_commissions: {
        Row: {
          amount_eur: number
          approved_at: string | null
          cancel_reason: string | null
          created_at: string
          device_id: string | null
          id: string
          member_id: string
          order_id: string | null
          paid_at: string | null
          partner_id: string
          release_at: string | null
          status: Database["public"]["Enums"]["commission_status"]
          trigger_at: string | null
          trigger_event: string
        }
        Insert: {
          amount_eur?: number
          approved_at?: string | null
          cancel_reason?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          member_id: string
          order_id?: string | null
          paid_at?: string | null
          partner_id: string
          release_at?: string | null
          status?: Database["public"]["Enums"]["commission_status"]
          trigger_at?: string | null
          trigger_event?: string
        }
        Update: {
          amount_eur?: number
          approved_at?: string | null
          cancel_reason?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          member_id?: string
          order_id?: string | null
          paid_at?: string | null
          partner_id?: string
          release_at?: string | null
          status?: Database["public"]["Enums"]["commission_status"]
          trigger_at?: string | null
          trigger_event?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_commissions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_commissions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_commissions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_commissions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_invites: {
        Row: {
          channel: Database["public"]["Enums"]["invite_channel"]
          converted_member_id: string | null
          created_at: string
          id: string
          invitee_email: string | null
          invitee_name: string
          invitee_phone: string | null
          metadata: Json | null
          partner_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["invite_status"]
          view_count: number | null
          viewed_at: string | null
        }
        Insert: {
          channel: Database["public"]["Enums"]["invite_channel"]
          converted_member_id?: string | null
          created_at?: string
          id?: string
          invitee_email?: string | null
          invitee_name: string
          invitee_phone?: string | null
          metadata?: Json | null
          partner_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invite_status"]
          view_count?: number | null
          viewed_at?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["invite_channel"]
          converted_member_id?: string | null
          created_at?: string
          id?: string
          invitee_email?: string | null
          invitee_name?: string
          invitee_phone?: string | null
          metadata?: Json | null
          partner_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invite_status"]
          view_count?: number | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_invites_converted_member_id_fkey"
            columns: ["converted_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_invites_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_members: {
        Row: {
          added_at: string | null
          added_by: string | null
          id: string
          member_id: string
          notes: string | null
          partner_id: string
          relationship_type: string | null
          removed_at: string | null
        }
        Insert: {
          added_at?: string | null
          added_by?: string | null
          id?: string
          member_id: string
          notes?: string | null
          partner_id: string
          relationship_type?: string | null
          removed_at?: string | null
        }
        Update: {
          added_at?: string | null
          added_by?: string | null
          id?: string
          member_id?: string
          notes?: string | null
          partner_id?: string
          relationship_type?: string | null
          removed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_members_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_post_links: {
        Row: {
          clicks: number | null
          commission: number | null
          created_at: string | null
          id: string
          partner_id: string
          post_id: string
          purchases: number | null
          revenue: number | null
          signups: number | null
          status: string | null
          tracked_code: string
          tracked_path: string
          tracked_url: string
        }
        Insert: {
          clicks?: number | null
          commission?: number | null
          created_at?: string | null
          id?: string
          partner_id: string
          post_id: string
          purchases?: number | null
          revenue?: number | null
          signups?: number | null
          status?: string | null
          tracked_code: string
          tracked_path: string
          tracked_url: string
        }
        Update: {
          clicks?: number | null
          commission?: number | null
          created_at?: string | null
          id?: string
          partner_id?: string
          post_id?: string
          purchases?: number | null
          revenue?: number | null
          signups?: number | null
          status?: string | null
          tracked_code?: string
          tracked_path?: string
          tracked_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_post_links_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_post_links_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_presentations: {
        Row: {
          created_at: string | null
          description: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          partner_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          partner_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          partner_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      partner_pricing_tiers: {
        Row: {
          billing_frequency: string
          commission_amount: number | null
          created_at: string | null
          created_by: string | null
          effective_from: string | null
          effective_to: string | null
          id: string
          membership_type: string
          name: string
          partner_id: string
          pendant_net_price: number | null
          registration_fee: number | null
          registration_fee_discount_percent: number | null
          subscription_net_price: number
        }
        Insert: {
          billing_frequency: string
          commission_amount?: number | null
          created_at?: string | null
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          membership_type: string
          name: string
          partner_id: string
          pendant_net_price?: number | null
          registration_fee?: number | null
          registration_fee_discount_percent?: number | null
          subscription_net_price: number
        }
        Update: {
          billing_frequency?: string
          commission_amount?: number | null
          created_at?: string | null
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          membership_type?: string
          name?: string
          partner_id?: string
          pendant_net_price?: number | null
          registration_fee?: number | null
          registration_fee_discount_percent?: number | null
          subscription_net_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "partner_pricing_tiers_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_verification_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          partner_id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          partner_id: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          partner_id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_verification_tokens_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          additional_notes: string | null
          agreement_signed_at: string | null
          agreement_version: string | null
          alert_visibility_enabled: boolean | null
          billing_model: string | null
          cif: string | null
          company_name: string | null
          contact_name: string
          created_at: string
          current_client_base: string | null
          custom_rate_monthly: number | null
          email: string
          estimated_monthly_referrals: string | null
          facility_address: string | null
          facility_resident_count: number | null
          how_heard_about_us: string | null
          id: string
          last_name: string | null
          motivation: string | null
          notes_internal: string | null
          organization_registration: string | null
          organization_type: string | null
          organization_website: string | null
          partner_type: string
          payout_beneficiary_name: string | null
          payout_iban: string | null
          payout_method: string
          phone: string | null
          position_title: string | null
          preferred_language: string
          referral_code: string
          region: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["partner_status"]
          user_id: string | null
        }
        Insert: {
          additional_notes?: string | null
          agreement_signed_at?: string | null
          agreement_version?: string | null
          alert_visibility_enabled?: boolean | null
          billing_model?: string | null
          cif?: string | null
          company_name?: string | null
          contact_name: string
          created_at?: string
          current_client_base?: string | null
          custom_rate_monthly?: number | null
          email: string
          estimated_monthly_referrals?: string | null
          facility_address?: string | null
          facility_resident_count?: number | null
          how_heard_about_us?: string | null
          id?: string
          last_name?: string | null
          motivation?: string | null
          notes_internal?: string | null
          organization_registration?: string | null
          organization_type?: string | null
          organization_website?: string | null
          partner_type?: string
          payout_beneficiary_name?: string | null
          payout_iban?: string | null
          payout_method?: string
          phone?: string | null
          position_title?: string | null
          preferred_language?: string
          referral_code: string
          region?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["partner_status"]
          user_id?: string | null
        }
        Update: {
          additional_notes?: string | null
          agreement_signed_at?: string | null
          agreement_version?: string | null
          alert_visibility_enabled?: boolean | null
          billing_model?: string | null
          cif?: string | null
          company_name?: string | null
          contact_name?: string
          created_at?: string
          current_client_base?: string | null
          custom_rate_monthly?: number | null
          email?: string
          estimated_monthly_referrals?: string | null
          facility_address?: string | null
          facility_resident_count?: number | null
          how_heard_about_us?: string | null
          id?: string
          last_name?: string | null
          motivation?: string | null
          notes_internal?: string | null
          organization_registration?: string | null
          organization_type?: string | null
          organization_website?: string | null
          partner_type?: string
          payout_beneficiary_name?: string | null
          payout_iban?: string | null
          payout_method?: string
          phone?: string | null
          position_title?: string | null
          preferred_language?: string
          referral_code?: string
          region?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["partner_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partners_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partners_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          invoice_number: string | null
          member_id: string
          notes: string | null
          order_id: string | null
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_type: Database["public"]["Enums"]["payment_type"]
          status: Database["public"]["Enums"]["payment_status"] | null
          stripe_payment_id: string | null
          subscription_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          invoice_number?: string | null
          member_id: string
          notes?: string | null
          order_id?: string | null
          paid_at?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_type: Database["public"]["Enums"]["payment_type"]
          status?: Database["public"]["Enums"]["payment_status"] | null
          stripe_payment_id?: string | null
          subscription_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          invoice_number?: string | null
          member_id?: string
          notes?: string | null
          order_id?: string | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_type?: Database["public"]["Enums"]["payment_type"]
          status?: Database["public"]["Enums"]["payment_status"] | null
          stripe_payment_id?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          cost_price: number
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          selling_price_net: number
          selling_tax_rate: number
          sku: string | null
          supplier_name: string | null
          updated_at: string
        }
        Insert: {
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          selling_price_net?: number
          selling_tax_rate?: number
          sku?: string | null
          supplier_name?: string | null
          updated_at?: string
        }
        Update: {
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          selling_price_net?: number
          selling_tax_rate?: number
          sku?: string | null
          supplier_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      registration_drafts: {
        Row: {
          abandoned_at: string | null
          converted_member_id: string | null
          created_at: string
          current_step: number
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          session_id: string
          source: string
          status: string
          updated_at: string
          wizard_data: Json
        }
        Insert: {
          abandoned_at?: string | null
          converted_member_id?: string | null
          created_at?: string
          current_step?: number
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          session_id: string
          source?: string
          status?: string
          updated_at?: string
          wizard_data?: Json
        }
        Update: {
          abandoned_at?: string | null
          converted_member_id?: string | null
          created_at?: string
          current_step?: number
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          session_id?: string
          source?: string
          status?: string
          updated_at?: string
          wizard_data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "registration_drafts_converted_member_id_fkey"
            columns: ["converted_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_alert_log: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          resolved_at: string | null
          shift_date: string
          shift_type: string
          staff_id: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string
          id?: string
          resolved_at?: string | null
          shift_date?: string
          shift_type: string
          staff_id?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          resolved_at?: string | null
          shift_date?: string
          shift_type?: string
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_alert_log_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_alert_log_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      shift_notes: {
        Row: {
          created_at: string | null
          followup_completed: boolean | null
          id: string
          member_id: string | null
          note_content: string
          requires_followup: boolean | null
          staff_id: string | null
        }
        Insert: {
          created_at?: string | null
          followup_completed?: boolean | null
          id?: string
          member_id?: string | null
          note_content: string
          requires_followup?: boolean | null
          staff_id?: string | null
        }
        Update: {
          created_at?: string | null
          followup_completed?: boolean | null
          id?: string
          member_id?: string | null
          note_content?: string
          requires_followup?: boolean | null
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_notes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_notes_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_notes_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      social_post_metrics: {
        Row: {
          comments_count: number | null
          created_at: string
          facebook_post_id: string
          fetched_at: string
          id: string
          impressions: number | null
          reactions_breakdown: Json | null
          reactions_total: number | null
          shares_count: number | null
          social_post_id: string
        }
        Insert: {
          comments_count?: number | null
          created_at?: string
          facebook_post_id: string
          fetched_at?: string
          id?: string
          impressions?: number | null
          reactions_breakdown?: Json | null
          reactions_total?: number | null
          shares_count?: number | null
          social_post_id: string
        }
        Update: {
          comments_count?: number | null
          created_at?: string
          facebook_post_id?: string
          fetched_at?: string
          id?: string
          impressions?: number | null
          reactions_breakdown?: Json | null
          reactions_total?: number | null
          shares_count?: number | null
          social_post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_post_metrics_social_post_id_fkey"
            columns: ["social_post_id"]
            isOneToOne: true
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_post_research: {
        Row: {
          compliance_notes: string | null
          created_at: string
          id: string
          key_points: string | null
          post_id: string
          sources: Json | null
        }
        Insert: {
          compliance_notes?: string | null
          created_at?: string
          id?: string
          key_points?: string | null
          post_id: string
          sources?: Json | null
        }
        Update: {
          compliance_notes?: string | null
          created_at?: string
          id?: string
          key_points?: string | null
          post_id?: string
          sources?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "social_post_research_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          approved_by: string | null
          content_channels: string[] | null
          created_at: string
          created_by: string | null
          error_message: string | null
          facebook_post_id: string | null
          goal: string | null
          id: string
          image_url: string | null
          language: string
          partner_audience: string | null
          partner_enabled: boolean | null
          partner_published_at: string | null
          partner_selected_partner_ids: string[] | null
          platform: string
          post_text: string | null
          primary_url: string | null
          published_at: string | null
          scheduled_for: string | null
          status: string
          target_audience: string | null
          topic: string | null
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          content_channels?: string[] | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          facebook_post_id?: string | null
          goal?: string | null
          id?: string
          image_url?: string | null
          language?: string
          partner_audience?: string | null
          partner_enabled?: boolean | null
          partner_published_at?: string | null
          partner_selected_partner_ids?: string[] | null
          platform?: string
          post_text?: string | null
          primary_url?: string | null
          published_at?: string | null
          scheduled_for?: string | null
          status?: string
          target_audience?: string | null
          topic?: string | null
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          content_channels?: string[] | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          facebook_post_id?: string | null
          goal?: string | null
          id?: string
          image_url?: string | null
          language?: string
          partner_audience?: string | null
          partner_enabled?: boolean | null
          partner_published_at?: string | null
          partner_selected_partner_ids?: string[] | null
          platform?: string
          post_text?: string | null
          primary_url?: string | null
          published_at?: string | null
          scheduled_for?: string | null
          status?: string
          target_audience?: string | null
          topic?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          annual_holiday_days: number | null
          avatar_url: string | null
          city: string | null
          contract_type: string | null
          contracted_hours_per_week: number | null
          country: string | null
          created_at: string | null
          date_of_birth: string | null
          department: string | null
          email: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          escalation_priority: number | null
          first_name: string
          hire_date: string | null
          id: string
          is_active: boolean | null
          is_on_call: boolean | null
          last_login_at: string | null
          last_name: string
          nationality: string | null
          nie_number: string | null
          notes: string | null
          personal_mobile: string | null
          phone: string | null
          position: string | null
          postal_code: string | null
          preferred_language:
            | Database["public"]["Enums"]["preferred_language"]
            | null
          province: string | null
          role: Database["public"]["Enums"]["app_role"]
          social_security_number: string | null
          status: string
          termination_date: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          annual_holiday_days?: number | null
          avatar_url?: string | null
          city?: string | null
          contract_type?: string | null
          contracted_hours_per_week?: number | null
          country?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          department?: string | null
          email: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          escalation_priority?: number | null
          first_name: string
          hire_date?: string | null
          id?: string
          is_active?: boolean | null
          is_on_call?: boolean | null
          last_login_at?: string | null
          last_name: string
          nationality?: string | null
          nie_number?: string | null
          notes?: string | null
          personal_mobile?: string | null
          phone?: string | null
          position?: string | null
          postal_code?: string | null
          preferred_language?:
            | Database["public"]["Enums"]["preferred_language"]
            | null
          province?: string | null
          role: Database["public"]["Enums"]["app_role"]
          social_security_number?: string | null
          status?: string
          termination_date?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          annual_holiday_days?: number | null
          avatar_url?: string | null
          city?: string | null
          contract_type?: string | null
          contracted_hours_per_week?: number | null
          country?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          department?: string | null
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          escalation_priority?: number | null
          first_name?: string
          hire_date?: string | null
          id?: string
          is_active?: boolean | null
          is_on_call?: boolean | null
          last_login_at?: string | null
          last_name?: string
          nationality?: string | null
          nie_number?: string | null
          notes?: string | null
          personal_mobile?: string | null
          phone?: string | null
          position?: string | null
          postal_code?: string | null
          preferred_language?:
            | Database["public"]["Enums"]["preferred_language"]
            | null
          province?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          social_security_number?: string | null
          status?: string
          termination_date?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      staff_activity_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          performed_by: string | null
          staff_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          performed_by?: string | null
          staff_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          performed_by?: string | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_activity_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_activity_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "staff_activity_log_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_activity_log_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      staff_documents: {
        Row: {
          created_at: string | null
          document_type: string
          file_name: string
          file_url: string
          id: string
          notes: string | null
          staff_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          document_type: string
          file_name: string
          file_url: string
          id?: string
          notes?: string | null
          staff_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          document_type?: string
          file_name?: string
          file_url?: string
          id?: string
          notes?: string | null
          staff_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_documents_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_documents_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "staff_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      staff_holidays: {
        Row: {
          created_at: string | null
          end_date: string
          id: string
          reason: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          staff_id: string
          start_date: string
          status: string
          total_days: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          end_date: string
          id?: string
          reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id: string
          start_date: string
          status?: string
          total_days?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          end_date?: string
          id?: string
          reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id?: string
          start_date?: string
          status?: string
          total_days?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_holidays_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_holidays_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "staff_holidays_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_holidays_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      staff_presence: {
        Row: {
          created_at: string
          id: string
          is_online: boolean
          last_heartbeat_at: string
          session_started_at: string
          staff_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_online?: boolean
          last_heartbeat_at?: string
          session_started_at?: string
          staff_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_online?: boolean
          last_heartbeat_at?: string
          session_started_at?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_presence_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_presence_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      staff_shift_covers: {
        Row: {
          cover_staff_id: string
          created_at: string | null
          expires_at: string | null
          holiday_id: string | null
          id: string
          original_staff_id: string
          requested_at: string | null
          requested_by: string | null
          responded_at: string | null
          response_note: string | null
          shift_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          cover_staff_id: string
          created_at?: string | null
          expires_at?: string | null
          holiday_id?: string | null
          id?: string
          original_staff_id: string
          requested_at?: string | null
          requested_by?: string | null
          responded_at?: string | null
          response_note?: string | null
          shift_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          cover_staff_id?: string
          created_at?: string | null
          expires_at?: string | null
          holiday_id?: string | null
          id?: string
          original_staff_id?: string
          requested_at?: string | null
          requested_by?: string | null
          responded_at?: string | null
          response_note?: string | null
          shift_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_shift_covers_cover_staff_id_fkey"
            columns: ["cover_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shift_covers_cover_staff_id_fkey"
            columns: ["cover_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "staff_shift_covers_holiday_id_fkey"
            columns: ["holiday_id"]
            isOneToOne: false
            referencedRelation: "staff_holidays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shift_covers_original_staff_id_fkey"
            columns: ["original_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shift_covers_original_staff_id_fkey"
            columns: ["original_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "staff_shift_covers_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shift_covers_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "staff_shift_covers_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "staff_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_shifts: {
        Row: {
          created_at: string | null
          created_by: string | null
          end_time: string
          id: string
          is_confirmed: boolean | null
          notes: string | null
          shift_date: string
          shift_type: string
          staff_id: string
          start_time: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          end_time: string
          id?: string
          is_confirmed?: boolean | null
          notes?: string | null
          shift_date: string
          shift_type: string
          staff_id: string
          start_time: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          end_time?: string
          id?: string
          is_confirmed?: boolean | null
          notes?: string | null
          shift_date?: string
          shift_type?: string
          staff_id?: string
          start_time?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_shifts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "staff_shifts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount: number
          billing_frequency: Database["public"]["Enums"]["billing_frequency"]
          created_at: string | null
          has_pendant: boolean | null
          id: string
          member_id: string
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          plan_type: Database["public"]["Enums"]["plan_type"]
          registration_fee_paid: boolean | null
          renewal_date: string
          start_date: string
          status: Database["public"]["Enums"]["subscription_status"] | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
        }
        Insert: {
          amount: number
          billing_frequency: Database["public"]["Enums"]["billing_frequency"]
          created_at?: string | null
          has_pendant?: boolean | null
          id?: string
          member_id: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          plan_type: Database["public"]["Enums"]["plan_type"]
          registration_fee_paid?: boolean | null
          renewal_date: string
          start_date: string
          status?: Database["public"]["Enums"]["subscription_status"] | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
        }
        Update: {
          amount?: number
          billing_frequency?: Database["public"]["Enums"]["billing_frequency"]
          created_at?: string | null
          has_pendant?: boolean | null
          id?: string
          member_id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          plan_type?: Database["public"]["Enums"]["plan_type"]
          registration_fee_paid?: boolean | null
          renewal_date?: string
          start_date?: string
          status?: Database["public"]["Enums"]["subscription_status"] | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      system_integrations: {
        Row: {
          access_token_encrypted: string | null
          channel_id: string | null
          channel_name: string | null
          connected_at: string | null
          connected_by: string | null
          created_at: string
          expires_at: string | null
          id: string
          integration_type: string
          last_used_at: string | null
          metadata: Json | null
          provider: string
          refresh_token_encrypted: string | null
          scopes: string[] | null
          status: string
          updated_at: string
        }
        Insert: {
          access_token_encrypted?: string | null
          channel_id?: string | null
          channel_name?: string | null
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          integration_type: string
          last_used_at?: string | null
          metadata?: Json | null
          provider: string
          refresh_token_encrypted?: string | null
          scopes?: string[] | null
          status?: string
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string | null
          channel_id?: string | null
          channel_name?: string | null
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          integration_type?: string
          last_used_at?: string | null
          metadata?: Json | null
          provider?: string
          refresh_token_encrypted?: string | null
          scopes?: string[] | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string | null
          key: string
          updated_at: string | null
          updated_by: string | null
          value: string
        }
        Insert: {
          created_at?: string | null
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: string
        }
        Update: {
          created_at?: string | null
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          member_id: string | null
          priority: string | null
          status: string | null
          task_type: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          member_id?: string | null
          priority?: string | null
          status?: string | null
          task_type?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          member_id?: string | null
          priority?: string | null
          status?: string | null
          task_type?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "tasks_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonials: {
        Row: {
          author_name: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          location_en: string
          location_es: string
          page: string
          quote_en: string
          quote_es: string
          rating: number
          updated_at: string
        }
        Insert: {
          author_name: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          location_en: string
          location_es: string
          page?: string
          quote_en: string
          quote_es: string
          rating?: number
          updated_at?: string
        }
        Update: {
          author_name?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          location_en?: string
          location_es?: string
          page?: string
          quote_en?: string
          quote_es?: string
          rating?: number
          updated_at?: string
        }
        Relationships: []
      }
      ticket_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          is_internal: boolean | null
          staff_id: string
          ticket_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_internal?: boolean | null
          staff_id: string
          ticket_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_internal?: boolean | null
          staff_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "internal_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      video_brand_settings: {
        Row: {
          captions_enabled_default: boolean | null
          created_at: string | null
          default_cta_en: string | null
          default_cta_es: string | null
          disclaimers_en: string | null
          disclaimers_es: string | null
          font_family: string | null
          id: string
          logo_url: string | null
          phone_en: string | null
          phone_es: string | null
          primary_color: string | null
          safe_margins_enabled: boolean | null
          secondary_color: string | null
          transition_style: string | null
          updated_at: string | null
          watermark_enabled: boolean | null
          web_url_en: string | null
          web_url_es: string | null
          whatsapp_en: string | null
          whatsapp_es: string | null
          youtube_footer_en: string | null
          youtube_footer_es: string | null
        }
        Insert: {
          captions_enabled_default?: boolean | null
          created_at?: string | null
          default_cta_en?: string | null
          default_cta_es?: string | null
          disclaimers_en?: string | null
          disclaimers_es?: string | null
          font_family?: string | null
          id?: string
          logo_url?: string | null
          phone_en?: string | null
          phone_es?: string | null
          primary_color?: string | null
          safe_margins_enabled?: boolean | null
          secondary_color?: string | null
          transition_style?: string | null
          updated_at?: string | null
          watermark_enabled?: boolean | null
          web_url_en?: string | null
          web_url_es?: string | null
          whatsapp_en?: string | null
          whatsapp_es?: string | null
          youtube_footer_en?: string | null
          youtube_footer_es?: string | null
        }
        Update: {
          captions_enabled_default?: boolean | null
          created_at?: string | null
          default_cta_en?: string | null
          default_cta_es?: string | null
          disclaimers_en?: string | null
          disclaimers_es?: string | null
          font_family?: string | null
          id?: string
          logo_url?: string | null
          phone_en?: string | null
          phone_es?: string | null
          primary_color?: string | null
          safe_margins_enabled?: boolean | null
          secondary_color?: string | null
          transition_style?: string | null
          updated_at?: string | null
          watermark_enabled?: boolean | null
          web_url_en?: string | null
          web_url_es?: string | null
          whatsapp_en?: string | null
          whatsapp_es?: string | null
          youtube_footer_en?: string | null
          youtube_footer_es?: string | null
        }
        Relationships: []
      }
      video_exports: {
        Row: {
          created_at: string | null
          format: string | null
          id: string
          mp4_url: string | null
          project_id: string
          published_at: string | null
          render_id: string | null
          srt_url: string | null
          thumbnail_url: string | null
          vtt_url: string | null
          youtube_error: string | null
          youtube_published_at: string | null
          youtube_status: string | null
          youtube_url: string | null
          youtube_video_id: string | null
        }
        Insert: {
          created_at?: string | null
          format?: string | null
          id?: string
          mp4_url?: string | null
          project_id: string
          published_at?: string | null
          render_id?: string | null
          srt_url?: string | null
          thumbnail_url?: string | null
          vtt_url?: string | null
          youtube_error?: string | null
          youtube_published_at?: string | null
          youtube_status?: string | null
          youtube_url?: string | null
          youtube_video_id?: string | null
        }
        Update: {
          created_at?: string | null
          format?: string | null
          id?: string
          mp4_url?: string | null
          project_id?: string
          published_at?: string | null
          render_id?: string | null
          srt_url?: string | null
          thumbnail_url?: string | null
          vtt_url?: string | null
          youtube_error?: string | null
          youtube_published_at?: string | null
          youtube_status?: string | null
          youtube_url?: string | null
          youtube_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_exports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_exports_render_id_fkey"
            columns: ["render_id"]
            isOneToOne: false
            referencedRelation: "video_renders"
            referencedColumns: ["id"]
          },
        ]
      }
      video_outreach_links: {
        Row: {
          campaign_id: string | null
          created_at: string | null
          export_id: string
          id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string | null
          export_id: string
          id?: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string | null
          export_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_outreach_links_export_id_fkey"
            columns: ["export_id"]
            isOneToOne: false
            referencedRelation: "video_exports"
            referencedColumns: ["id"]
          },
        ]
      }
      video_projects: {
        Row: {
          created_at: string | null
          created_by: string | null
          data_json: Json
          duration: number
          format: string
          id: string
          language: string
          name: string
          status: string
          template_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          data_json?: Json
          duration?: number
          format?: string
          id?: string
          language?: string
          name: string
          status?: string
          template_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          data_json?: Json
          duration?: number
          format?: string
          id?: string
          language?: string
          name?: string
          status?: string
          template_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_projects_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      video_renders: {
        Row: {
          created_at: string | null
          error: string | null
          id: string
          progress: number | null
          project_id: string
          stage: string | null
          status: string
          updated_at: string | null
          worker_job_id: string | null
        }
        Insert: {
          created_at?: string | null
          error?: string | null
          id?: string
          progress?: number | null
          project_id: string
          stage?: string | null
          status?: string
          updated_at?: string | null
          worker_job_id?: string | null
        }
        Update: {
          created_at?: string | null
          error?: string | null
          id?: string
          progress?: number | null
          project_id?: string
          stage?: string | null
          status?: string
          updated_at?: string | null
          worker_job_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_renders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      video_templates: {
        Row: {
          allowed_durations: number[] | null
          allowed_formats: string[] | null
          created_at: string | null
          description: string | null
          id: string
          is_locked: boolean | null
          name: string
          schema_json: Json
          thumbnail_url: string | null
          version: number | null
        }
        Insert: {
          allowed_durations?: number[] | null
          allowed_formats?: string[] | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_locked?: boolean | null
          name: string
          schema_json?: Json
          thumbnail_url?: string | null
          version?: number | null
        }
        Update: {
          allowed_durations?: number[] | null
          allowed_formats?: string[] | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_locked?: boolean | null
          name?: string
          schema_json?: Json
          thumbnail_url?: string | null
          version?: number | null
        }
        Relationships: []
      }
      voice_call_sessions: {
        Row: {
          call_sid: string
          caller_phone: string
          conversation_id: string | null
          created_at: string | null
          escalated_at: string | null
          escalation_reason: string | null
          id: string
          language: string | null
          member_id: string | null
          messages: Json | null
          status: string | null
          timeout_count: number | null
          updated_at: string | null
        }
        Insert: {
          call_sid: string
          caller_phone: string
          conversation_id?: string | null
          created_at?: string | null
          escalated_at?: string | null
          escalation_reason?: string | null
          id?: string
          language?: string | null
          member_id?: string | null
          messages?: Json | null
          status?: string | null
          timeout_count?: number | null
          updated_at?: string | null
        }
        Update: {
          call_sid?: string
          caller_phone?: string
          conversation_id?: string | null
          created_at?: string | null
          escalated_at?: string | null
          escalation_reason?: string | null
          id?: string
          language?: string | null
          member_id?: string | null
          messages?: Json | null
          status?: string | null
          timeout_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_call_sessions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_call_sessions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      website_events: {
        Row: {
          browser: string | null
          city: string | null
          country_code: string | null
          country_name: string | null
          created_at: string | null
          device_type: string | null
          event_type: string
          id: string
          language: string | null
          metadata: Json | null
          operating_system: string | null
          page_path: string | null
          page_title: string | null
          referrer: string | null
          region: string | null
          screen_resolution: string | null
          session_id: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_id: string | null
        }
        Insert: {
          browser?: string | null
          city?: string | null
          country_code?: string | null
          country_name?: string | null
          created_at?: string | null
          device_type?: string | null
          event_type: string
          id?: string
          language?: string | null
          metadata?: Json | null
          operating_system?: string | null
          page_path?: string | null
          page_title?: string | null
          referrer?: string | null
          region?: string | null
          screen_resolution?: string | null
          session_id?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Update: {
          browser?: string | null
          city?: string | null
          country_code?: string | null
          country_name?: string | null
          created_at?: string | null
          device_type?: string | null
          event_type?: string
          id?: string
          language?: string | null
          metadata?: Json | null
          operating_system?: string | null
          page_path?: string | null
          page_title?: string | null
          referrer?: string | null
          region?: string | null
          screen_resolution?: string | null
          session_id?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Relationships: []
      }
      website_images: {
        Row: {
          alt_text: string | null
          blur_placeholder: string | null
          created_at: string
          dominant_color: string | null
          id: string
          image_url: string
          location_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alt_text?: string | null
          blur_placeholder?: string | null
          created_at?: string
          dominant_color?: string | null
          id?: string
          image_url: string
          location_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alt_text?: string | null
          blur_placeholder?: string | null
          created_at?: string
          dominant_color?: string | null
          id?: string
          image_url?: string
          location_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "website_images_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_images_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "staff_holiday_balance"
            referencedColumns: ["staff_id"]
          },
        ]
      }
    }
    Views: {
      partner_monthly_referral_counts: {
        Row: {
          invites_sent: number | null
          month: string | null
          partner_id: string | null
          registrations: number | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_invites_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_holiday_balance: {
        Row: {
          annual_holiday_days: number | null
          days_approved: number | null
          days_pending: number | null
          days_remaining: number | null
          days_used_or_pending: number | null
          first_name: string | null
          last_name: string | null
          staff_id: string | null
        }
        Relationships: []
      }
      staff_on_shift_now: {
        Row: {
          end_time: string | null
          first_name: string | null
          id: string | null
          last_name: string | null
          shift_date: string | null
          shift_type: string | null
          staff_id: string | null
          start_time: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_shift_coverage: {
        Args: { p_end: string; p_start: string }
        Returns: {
          check_date: string
          check_shift_type: string
          is_covered: boolean
          staff_name: string
        }[]
      }
      expire_pending_covers: { Args: never; Returns: number }
      get_admin_dashboard_stats: { Args: never; Returns: Json }
      get_member_id: { Args: { _user_id: string }; Returns: string }
      get_partner_id: { Args: { _user_id: string }; Returns: string }
      get_sales_command_stats: { Args: never; Returns: Json }
      get_staff_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_todays_birthdays: {
        Args: never
        Returns: {
          address_line_1: string
          address_line_2: string | null
          city: string
          country: string | null
          courtesy_call_frequency: string | null
          courtesy_calls_enabled: boolean | null
          created_at: string | null
          date_of_birth: string
          email: string
          first_name: string
          id: string
          last_name: string
          next_courtesy_call_date: string | null
          nie_dni: string | null
          phone: string
          photo_url: string | null
          postal_code: string
          preferred_contact_method: string | null
          preferred_contact_time: string | null
          preferred_language:
            | Database["public"]["Enums"]["preferred_language"]
            | null
          province: string
          ref_partner_id: string | null
          ref_post_id: string | null
          special_instructions: string | null
          status: Database["public"]["Enums"]["member_status"] | null
          updated_at: string | null
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "members"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_role_info: { Args: { _user_id: string }; Returns: Json }
      increment_partner_link_clicks: {
        Args: { link_id: string }
        Returns: undefined
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_partner: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      alert_status: "incoming" | "in_progress" | "resolved" | "escalated"
      alert_type:
        | "sos_button"
        | "fall_detected"
        | "low_battery"
        | "geo_fence"
        | "check_in"
        | "manual"
        | "device_offline"
      app_role:
        | "super_admin"
        | "admin"
        | "call_centre"
        | "call_centre_supervisor"
      billing_frequency: "monthly" | "annual"
      commission_status: "pending_release" | "approved" | "paid" | "cancelled"
      communication_direction: "inbound" | "outbound"
      communication_type: "call_inbound" | "call_outbound" | "sms" | "whatsapp"
      contact_method_type: "email" | "phone" | "social" | "other"
      cost_category:
        | "supplier_payment"
        | "operational"
        | "marketing"
        | "staff"
        | "other"
      cost_frequency: "one_time" | "monthly" | "annual"
      cost_status: "pending" | "paid" | "overdue"
      device_config_status: "pending" | "configured" | "failed"
      device_status:
        | "active"
        | "inactive"
        | "faulty"
        | "returned"
        | "in_stock"
        | "reserved"
        | "allocated"
        | "with_staff"
        | "live"
      documentation_category:
        | "general"
        | "member_guide"
        | "staff"
        | "device"
        | "emergency"
        | "partner"
      documentation_status: "draft" | "published"
      escalation_target_type:
        | "browser_alert"
        | "mobile_call"
        | "emergency_contact_call"
      import_batch_status:
        | "uploaded"
        | "parsed"
        | "importing"
        | "completed"
        | "failed"
      import_row_status: "pending" | "imported" | "failed" | "skipped"
      import_row_target: "member" | "crm_contact" | "skip"
      invite_channel: "email" | "sms" | "whatsapp" | "link"
      invite_status:
        | "draft"
        | "sent"
        | "viewed"
        | "registered"
        | "converted"
        | "expired"
      isabella_note_type:
        | "observation"
        | "question_asked"
        | "member_response"
        | "triage_decision"
        | "handover_briefing"
        | "flag"
      member_status: "active" | "inactive" | "suspended"
      order_item_type:
        | "pendant"
        | "registration_fee"
        | "subscription"
        | "shipping"
      order_status:
        | "pending"
        | "processing"
        | "shipped"
        | "delivered"
        | "cancelled"
      participant_join_method:
        | "automatic"
        | "accepted_alert"
        | "added_by_staff"
        | "callback_routed"
      participant_type:
        | "member"
        | "staff"
        | "ai"
        | "emergency_contact"
        | "external_service"
      partner_status: "invited" | "pending" | "active" | "suspended"
      payment_method: "stripe" | "bank_transfer" | "paypal"
      payment_status: "pending" | "completed" | "failed" | "refunded"
      payment_type:
        | "registration"
        | "subscription"
        | "device"
        | "shipping"
        | "order"
      plan_type: "single" | "couple"
      preferred_language: "en" | "es"
      recipient_type: "member" | "emergency_contact" | "emergency_services"
      subscription_status:
        | "active"
        | "cancelled"
        | "expired"
        | "paused"
        | "pending"
        | "past_due"
        | "suspended"
      ticket_category:
        | "pendant_help"
        | "technical_issue"
        | "member_query"
        | "billing_question"
        | "general"
        | "other"
      ticket_status: "open" | "in_progress" | "pending" | "resolved" | "closed"
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
      alert_status: ["incoming", "in_progress", "resolved", "escalated"],
      alert_type: [
        "sos_button",
        "fall_detected",
        "low_battery",
        "geo_fence",
        "check_in",
        "manual",
        "device_offline",
      ],
      app_role: [
        "super_admin",
        "admin",
        "call_centre",
        "call_centre_supervisor",
      ],
      billing_frequency: ["monthly", "annual"],
      commission_status: ["pending_release", "approved", "paid", "cancelled"],
      communication_direction: ["inbound", "outbound"],
      communication_type: ["call_inbound", "call_outbound", "sms", "whatsapp"],
      contact_method_type: ["email", "phone", "social", "other"],
      cost_category: [
        "supplier_payment",
        "operational",
        "marketing",
        "staff",
        "other",
      ],
      cost_frequency: ["one_time", "monthly", "annual"],
      cost_status: ["pending", "paid", "overdue"],
      device_config_status: ["pending", "configured", "failed"],
      device_status: [
        "active",
        "inactive",
        "faulty",
        "returned",
        "in_stock",
        "reserved",
        "allocated",
        "with_staff",
        "live",
      ],
      documentation_category: [
        "general",
        "member_guide",
        "staff",
        "device",
        "emergency",
        "partner",
      ],
      documentation_status: ["draft", "published"],
      escalation_target_type: [
        "browser_alert",
        "mobile_call",
        "emergency_contact_call",
      ],
      import_batch_status: [
        "uploaded",
        "parsed",
        "importing",
        "completed",
        "failed",
      ],
      import_row_status: ["pending", "imported", "failed", "skipped"],
      import_row_target: ["member", "crm_contact", "skip"],
      invite_channel: ["email", "sms", "whatsapp", "link"],
      invite_status: [
        "draft",
        "sent",
        "viewed",
        "registered",
        "converted",
        "expired",
      ],
      isabella_note_type: [
        "observation",
        "question_asked",
        "member_response",
        "triage_decision",
        "handover_briefing",
        "flag",
      ],
      member_status: ["active", "inactive", "suspended"],
      order_item_type: [
        "pendant",
        "registration_fee",
        "subscription",
        "shipping",
      ],
      order_status: [
        "pending",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
      ],
      participant_join_method: [
        "automatic",
        "accepted_alert",
        "added_by_staff",
        "callback_routed",
      ],
      participant_type: [
        "member",
        "staff",
        "ai",
        "emergency_contact",
        "external_service",
      ],
      partner_status: ["invited", "pending", "active", "suspended"],
      payment_method: ["stripe", "bank_transfer", "paypal"],
      payment_status: ["pending", "completed", "failed", "refunded"],
      payment_type: [
        "registration",
        "subscription",
        "device",
        "shipping",
        "order",
      ],
      plan_type: ["single", "couple"],
      preferred_language: ["en", "es"],
      recipient_type: ["member", "emergency_contact", "emergency_services"],
      subscription_status: [
        "active",
        "cancelled",
        "expired",
        "paused",
        "pending",
        "past_due",
        "suspended",
      ],
      ticket_category: [
        "pendant_help",
        "technical_issue",
        "member_query",
        "billing_question",
        "general",
        "other",
      ],
      ticket_status: ["open", "in_progress", "pending", "resolved", "closed"],
    },
  },
} as const
