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
      agent_notifications: {
        Row: {
          content: string
          created_at: string
          id: string
          is_read: boolean
          recipient_id: string
          sender_id: string | null
          ticket_id: string | null
          type: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_read?: boolean
          recipient_id: string
          sender_id?: string | null
          ticket_id?: string | null
          type?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_read?: boolean
          recipient_id?: string
          sender_id?: string | null
          ticket_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_notifications_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          default_assign: string | null
          description: string | null
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          default_assign?: string | null
          description?: string | null
          id: string
          name: string
          sort_order?: number
        }
        Update: {
          default_assign?: string | null
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      category_clauses: {
        Row: {
          category_id: string
          clause_id: string
        }
        Insert: {
          category_id: string
          clause_id: string
        }
        Update: {
          category_id?: string
          clause_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_clauses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_clauses_clause_id_fkey"
            columns: ["clause_id"]
            isOneToOne: false
            referencedRelation: "clauses"
            referencedColumns: ["id"]
          },
        ]
      }
      clauses: {
        Row: {
          code: string
          description: string
          id: string
        }
        Insert: {
          code: string
          description: string
          id: string
        }
        Update: {
          code?: string
          description?: string
          id?: string
        }
        Relationships: []
      }
      client_users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          last_seen_at: string | null
          phone: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          last_seen_at?: string | null
          phone?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          last_seen_at?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      decision_rules: {
        Row: {
          condition_extra: Json | null
          condition_type: string
          condition_value: string | null
          description: string | null
          id: string
          is_active: boolean
          message: string
          name: string
          sort_order: number
          suggested_clause_ids: string[] | null
          suggested_macro_id: string | null
          suggested_tag_ids: string[] | null
        }
        Insert: {
          condition_extra?: Json | null
          condition_type: string
          condition_value?: string | null
          description?: string | null
          id: string
          is_active?: boolean
          message: string
          name: string
          sort_order?: number
          suggested_clause_ids?: string[] | null
          suggested_macro_id?: string | null
          suggested_tag_ids?: string[] | null
        }
        Update: {
          condition_extra?: Json | null
          condition_type?: string
          condition_value?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          message?: string
          name?: string
          sort_order?: number
          suggested_clause_ids?: string[] | null
          suggested_macro_id?: string | null
          suggested_tag_ids?: string[] | null
        }
        Relationships: []
      }
      delayed_order_contacts: {
        Row: {
          contact_type: string
          contacted_at: string
          contacted_by: string
          created_at: string
          delayed_order_id: string
          id: string
          next_contact_at: string | null
          notes: string | null
          phone_call_id: string | null
        }
        Insert: {
          contact_type?: string
          contacted_at?: string
          contacted_by?: string
          created_at?: string
          delayed_order_id: string
          id?: string
          next_contact_at?: string | null
          notes?: string | null
          phone_call_id?: string | null
        }
        Update: {
          contact_type?: string
          contacted_at?: string
          contacted_by?: string
          created_at?: string
          delayed_order_id?: string
          id?: string
          next_contact_at?: string | null
          notes?: string | null
          phone_call_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delayed_order_contacts_delayed_order_id_fkey"
            columns: ["delayed_order_id"]
            isOneToOne: false
            referencedRelation: "delayed_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delayed_order_contacts_phone_call_id_fkey"
            columns: ["phone_call_id"]
            isOneToOne: false
            referencedRelation: "phone_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      delayed_orders: {
        Row: {
          client_name: string
          client_phone: string | null
          created_at: string
          created_by: string
          id: string
          is_archived: boolean
          notes: string | null
          order_date: string | null
          order_number: string
          situacao: string | null
          sla_deadline_at: string | null
          updated_at: string
          valor_total: number | null
        }
        Insert: {
          client_name: string
          client_phone?: string | null
          created_at?: string
          created_by?: string
          id?: string
          is_archived?: boolean
          notes?: string | null
          order_date?: string | null
          order_number: string
          situacao?: string | null
          sla_deadline_at?: string | null
          updated_at?: string
          valor_total?: number | null
        }
        Update: {
          client_name?: string
          client_phone?: string | null
          created_at?: string
          created_by?: string
          id?: string
          is_archived?: boolean
          notes?: string | null
          order_date?: string | null
          order_number?: string
          situacao?: string | null
          sla_deadline_at?: string | null
          updated_at?: string
          valor_total?: number | null
        }
        Relationships: []
      }
      delivery_confirmations: {
        Row: {
          client_phone: string
          confirmed: boolean
          contact_attempts: number
          created_at: string
          created_by: string
          id: string
          notes: string | null
          order_number: string
        }
        Insert: {
          client_phone: string
          confirmed: boolean
          contact_attempts?: number
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          order_number: string
        }
        Update: {
          client_phone?: string
          confirmed?: boolean
          contact_attempts?: number
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          order_number?: string
        }
        Relationships: []
      }
      email_blocked_senders: {
        Row: {
          created_at: string
          created_by: string
          id: string
          pattern: string
          pattern_type: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          pattern: string
          pattern_type?: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          pattern?: string
          pattern_type?: string
          reason?: string | null
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          created_at: string
          delivery_details: string | null
          delivery_status: string
          error_message: string | null
          id: string
          recipient: string
          smtp_response: string | null
          source: string
          status: string
          subject: string
          template_id: string | null
          ticket_id: string | null
        }
        Insert: {
          created_at?: string
          delivery_details?: string | null
          delivery_status?: string
          error_message?: string | null
          id?: string
          recipient: string
          smtp_response?: string | null
          source?: string
          status?: string
          subject: string
          template_id?: string | null
          ticket_id?: string | null
        }
        Update: {
          created_at?: string
          delivery_details?: string | null
          delivery_status?: string
          error_message?: string | null
          id?: string
          recipient?: string
          smtp_response?: string | null
          source?: string
          status?: string
          subject?: string
          template_id?: string | null
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html: string
          description: string | null
          id: string
          subject: string
          updated_at: string
        }
        Insert: {
          body_html: string
          description?: string | null
          id: string
          subject: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          description?: string | null
          id?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_threads: {
        Row: {
          created_at: string
          email_address: string
          id: string
          last_message_id: string | null
          ticket_id: string
        }
        Insert: {
          created_at?: string
          email_address: string
          id?: string
          last_message_id?: string | null
          ticket_id: string
        }
        Update: {
          created_at?: string
          email_address?: string
          id?: string
          last_message_id?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_threads_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      faq_items: {
        Row: {
          answer: string
          created_at: string
          id: string
          is_active: boolean
          question: string
          sort_order: number
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          is_active?: boolean
          question: string
          sort_order?: number
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          is_active?: boolean
          question?: string
          sort_order?: number
        }
        Relationships: []
      }
      macros: {
        Row: {
          content: string
          id: string
          macro_category: Database["public"]["Enums"]["macro_category"]
          sort_order: number
          title: string
          variables: string[] | null
        }
        Insert: {
          content: string
          id: string
          macro_category: Database["public"]["Enums"]["macro_category"]
          sort_order?: number
          title: string
          variables?: string[] | null
        }
        Update: {
          content?: string
          id?: string
          macro_category?: Database["public"]["Enums"]["macro_category"]
          sort_order?: number
          title?: string
          variables?: string[] | null
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ticket_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_emails: {
        Row: {
          attachments_meta: Json | null
          body_html: string | null
          body_text: string | null
          created_at: string
          from_address: string
          from_name: string | null
          id: string
          message_id: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          subject: string
          ticket_id: string | null
        }
        Insert: {
          attachments_meta?: Json | null
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          from_address: string
          from_name?: string | null
          id?: string
          message_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          subject: string
          ticket_id?: string | null
        }
        Update: {
          attachments_meta?: Json | null
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          from_address?: string
          from_name?: string | null
          id?: string
          message_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          subject?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_emails_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_call_reminders: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_completed: boolean
          message: string
          phone_call_id: string
          remind_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          is_completed?: boolean
          message: string
          phone_call_id: string
          remind_at: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_completed?: boolean
          message?: string
          phone_call_id?: string
          remind_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_call_reminders_phone_call_id_fkey"
            columns: ["phone_call_id"]
            isOneToOne: false
            referencedRelation: "phone_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_call_statuses: {
        Row: {
          color: string | null
          id: string
          is_default: boolean | null
          name: string
          sort_order: number
        }
        Insert: {
          color?: string | null
          id: string
          is_default?: boolean | null
          name: string
          sort_order?: number
        }
        Update: {
          color?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      phone_calls: {
        Row: {
          assigned_to: string | null
          client_name: string
          client_phone: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string
          id: string
          invoice_number: string | null
          notes: string | null
          priority: string
          status: string
          subject: string
          ticket_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_name: string
          client_phone: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          invoice_number?: string | null
          notes?: string | null
          priority?: string
          status?: string
          subject: string
          ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_name?: string
          client_phone?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          invoice_number?: string | null
          notes?: string | null
          priority?: string
          status?: string
          subject?: string
          ticket_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_calls_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      post_delivery_confirmations: {
        Row: {
          assembly_nps: number | null
          assembly_ok: boolean
          assembly_status: string | null
          call_status: string | null
          client_name: string
          client_phone: string
          client_satisfied: boolean
          created_at: string
          created_by: string
          delivery_date: string | null
          id: string
          issues_reported: string | null
          no_damage: boolean
          notes: string | null
          order_number: string
          product_ok: boolean
        }
        Insert: {
          assembly_nps?: number | null
          assembly_ok?: boolean
          assembly_status?: string | null
          call_status?: string | null
          client_name: string
          client_phone: string
          client_satisfied?: boolean
          created_at?: string
          created_by?: string
          delivery_date?: string | null
          id?: string
          issues_reported?: string | null
          no_damage?: boolean
          notes?: string | null
          order_number: string
          product_ok?: boolean
        }
        Update: {
          assembly_nps?: number | null
          assembly_ok?: boolean
          assembly_status?: string | null
          call_status?: string | null
          client_name?: string
          client_phone?: string
          client_satisfied?: boolean
          created_at?: string
          created_by?: string
          delivery_date?: string | null
          id?: string
          issues_reported?: string | null
          no_damage?: boolean
          notes?: string | null
          order_number?: string
          product_ok?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          agent_color: string | null
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          agent_color?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          agent_color?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      resolution_approvals: {
        Row: {
          created_at: string
          id: string
          proposed_client_reason: string | null
          proposed_reason: string
          proposed_type: string
          requested_by: string
          resolved_at: string | null
          status: string
          supervisor_id: string
          supervisor_notes: string | null
          ticket_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          proposed_client_reason?: string | null
          proposed_reason: string
          proposed_type: string
          requested_by: string
          resolved_at?: string | null
          status?: string
          supervisor_id: string
          supervisor_notes?: string | null
          ticket_id: string
        }
        Update: {
          created_at?: string
          id?: string
          proposed_client_reason?: string | null
          proposed_reason?: string
          proposed_type?: string
          requested_by?: string
          resolved_at?: string | null
          status?: string
          supervisor_id?: string
          supervisor_notes?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resolution_approvals_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_config: {
        Row: {
          category_id: string
          first_response_minutes: number
          id: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          resolution_minutes: number
        }
        Insert: {
          category_id: string
          first_response_minutes: number
          id: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          resolution_minutes: number
        }
        Update: {
          category_id?: string
          first_response_minutes?: number
          id?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolution_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "sla_config_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      subcategories: {
        Row: {
          category_id: string
          default_assign: string | null
          description: string | null
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          category_id: string
          default_assign?: string | null
          description?: string | null
          id: string
          name: string
          sort_order?: number
        }
        Update: {
          category_id?: string
          default_assign?: string | null
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string | null
          id: string
          name: string
          sort_order: number
          tag_group: Database["public"]["Enums"]["tag_group"]
        }
        Insert: {
          color?: string | null
          id: string
          name: string
          sort_order?: number
          tag_group: Database["public"]["Enums"]["tag_group"]
        }
        Update: {
          color?: string | null
          id?: string
          name?: string
          sort_order?: number
          tag_group?: Database["public"]["Enums"]["tag_group"]
        }
        Relationships: []
      }
      ticket_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id: string
          ticket_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id?: string
          ticket_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          ticket_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_clauses: {
        Row: {
          clause_id: string
          ticket_id: string
        }
        Insert: {
          clause_id: string
          ticket_id: string
        }
        Update: {
          clause_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_clauses_clause_id_fkey"
            columns: ["clause_id"]
            isOneToOne: false
            referencedRelation: "clauses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_clauses_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_documents: {
        Row: {
          created_at: string
          document_type: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id: string
          ticket_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          document_type: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id?: string
          ticket_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          document_type?: string
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          ticket_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_documents_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_events: {
        Row: {
          content: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          ticket_id: string
          user_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          ticket_id: string
          user_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          ticket_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          original_content: string | null
          sender_id: string
          sender_type: string
          ticket_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          original_content?: string | null
          sender_id: string
          sender_type: string
          ticket_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          original_content?: string | null
          sender_id?: string
          sender_type?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_read_status: {
        Row: {
          agent_id: string
          last_read_at: string
          ticket_id: string
        }
        Insert: {
          agent_id: string
          last_read_at?: string
          ticket_id: string
        }
        Update: {
          agent_id?: string
          last_read_at?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_read_status_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_statuses: {
        Row: {
          color: string | null
          default_assign: string | null
          id: string
          is_closed: boolean | null
          is_resolved: boolean | null
          name: string
          pauses_sla: boolean | null
          sla_minutes: number | null
          sort_order: number
        }
        Insert: {
          color?: string | null
          default_assign?: string | null
          id: string
          is_closed?: boolean | null
          is_resolved?: boolean | null
          name: string
          pauses_sla?: boolean | null
          sla_minutes?: number | null
          sort_order?: number
        }
        Update: {
          color?: string | null
          default_assign?: string | null
          id?: string
          is_closed?: boolean | null
          is_resolved?: boolean | null
          name?: string
          pauses_sla?: boolean | null
          sla_minutes?: number | null
          sort_order?: number
        }
        Relationships: []
      }
      ticket_tags: {
        Row: {
          tag_id: string
          ticket_id: string
        }
        Insert: {
          tag_id: string
          ticket_id: string
        }
        Update: {
          tag_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_tags_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_to: string | null
          category_id: string | null
          client_email: string | null
          client_name: string
          client_phone: string | null
          client_user_id: string | null
          created_at: string
          created_by: string
          delivery_date: string | null
          delivery_type: string | null
          description: string | null
          email_received_at: string | null
          first_responded_at: string | null
          has_original_packaging: boolean | null
          id: string
          is_assembled: boolean | null
          is_exhibition: boolean | null
          is_personalized: boolean | null
          needs_tpa: boolean | null
          order_number: string | null
          parent_ticket_id: string | null
          payment_method: string | null
          pickup_date: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          product_name: string | null
          purchase_date: string | null
          resolution_at: string | null
          resolution_by: string | null
          resolution_client_reason: string | null
          resolution_reason: string | null
          resolution_type: string | null
          resolved_at: string | null
          service_number: string | null
          sla_first_response_at: string | null
          sla_paused_at: string | null
          sla_paused_total_seconds: number | null
          sla_resolution_at: string | null
          sla_stage_deadline_at: string | null
          status: string
          status_changed_at: string | null
          subcategory_id: string | null
          subject: string
          ticket_number: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category_id?: string | null
          client_email?: string | null
          client_name: string
          client_phone?: string | null
          client_user_id?: string | null
          created_at?: string
          created_by: string
          delivery_date?: string | null
          delivery_type?: string | null
          description?: string | null
          email_received_at?: string | null
          first_responded_at?: string | null
          has_original_packaging?: boolean | null
          id?: string
          is_assembled?: boolean | null
          is_exhibition?: boolean | null
          is_personalized?: boolean | null
          needs_tpa?: boolean | null
          order_number?: string | null
          parent_ticket_id?: string | null
          payment_method?: string | null
          pickup_date?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          product_name?: string | null
          purchase_date?: string | null
          resolution_at?: string | null
          resolution_by?: string | null
          resolution_client_reason?: string | null
          resolution_reason?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          service_number?: string | null
          sla_first_response_at?: string | null
          sla_paused_at?: string | null
          sla_paused_total_seconds?: number | null
          sla_resolution_at?: string | null
          sla_stage_deadline_at?: string | null
          status?: string
          status_changed_at?: string | null
          subcategory_id?: string | null
          subject: string
          ticket_number?: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category_id?: string | null
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          client_user_id?: string | null
          created_at?: string
          created_by?: string
          delivery_date?: string | null
          delivery_type?: string | null
          description?: string | null
          email_received_at?: string | null
          first_responded_at?: string | null
          has_original_packaging?: boolean | null
          id?: string
          is_assembled?: boolean | null
          is_exhibition?: boolean | null
          is_personalized?: boolean | null
          needs_tpa?: boolean | null
          order_number?: string | null
          parent_ticket_id?: string | null
          payment_method?: string | null
          pickup_date?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          product_name?: string | null
          purchase_date?: string | null
          resolution_at?: string | null
          resolution_by?: string | null
          resolution_client_reason?: string | null
          resolution_reason?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          service_number?: string | null
          sla_first_response_at?: string | null
          sla_paused_at?: string | null
          sla_paused_total_seconds?: number | null
          sla_resolution_at?: string | null
          sla_stage_deadline_at?: string | null
          status?: string
          status_changed_at?: string | null
          subcategory_id?: string | null
          subject?: string
          ticket_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_client_user_id_fkey"
            columns: ["client_user_id"]
            isOneToOne: false
            referencedRelation: "client_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_status_fk"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "ticket_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
        ]
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
          role?: Database["public"]["Enums"]["app_role"]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_agent_profiles: {
        Args: never
        Returns: {
          full_name: string
          id: string
          role: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_authenticated_agent: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "agent" | "supervisor" | "client"
      macro_category:
        | "entrega"
        | "reclamacao"
        | "garantia"
        | "devolucao"
        | "pagamento"
        | "exposicao"
        | "geral"
      tag_group:
        | "prazo"
        | "produto"
        | "entrega"
        | "pagamentos"
        | "reclamacao"
        | "gestao_interna"
      ticket_priority: "P1" | "P2" | "P3"
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
      app_role: ["agent", "supervisor", "client"],
      macro_category: [
        "entrega",
        "reclamacao",
        "garantia",
        "devolucao",
        "pagamento",
        "exposicao",
        "geral",
      ],
      tag_group: [
        "prazo",
        "produto",
        "entrega",
        "pagamentos",
        "reclamacao",
        "gestao_interna",
      ],
      ticket_priority: ["P1", "P2", "P3"],
    },
  },
} as const
