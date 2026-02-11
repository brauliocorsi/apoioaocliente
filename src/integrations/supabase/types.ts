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
      categories: {
        Row: {
          description: string | null
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          description?: string | null
          id: string
          name: string
          sort_order?: number
        }
        Update: {
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
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string
          full_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
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
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          category_id: string
          id: string
          name: string
          sort_order?: number
        }
        Update: {
          category_id?: string
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
      tags: {
        Row: {
          id: string
          name: string
          sort_order: number
          tag_group: Database["public"]["Enums"]["tag_group"]
        }
        Insert: {
          id: string
          name: string
          sort_order?: number
          tag_group: Database["public"]["Enums"]["tag_group"]
        }
        Update: {
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
          created_at: string
          created_by: string
          delivery_date: string | null
          description: string | null
          first_responded_at: string | null
          has_original_packaging: boolean | null
          id: string
          is_assembled: boolean | null
          is_exhibition: boolean | null
          is_personalized: boolean | null
          needs_tpa: boolean | null
          order_number: string | null
          payment_method: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          purchase_date: string | null
          resolved_at: string | null
          sla_first_response_at: string | null
          sla_paused_at: string | null
          sla_paused_total_seconds: number | null
          sla_resolution_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
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
          created_at?: string
          created_by: string
          delivery_date?: string | null
          description?: string | null
          first_responded_at?: string | null
          has_original_packaging?: boolean | null
          id?: string
          is_assembled?: boolean | null
          is_exhibition?: boolean | null
          is_personalized?: boolean | null
          needs_tpa?: boolean | null
          order_number?: string | null
          payment_method?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          purchase_date?: string | null
          resolved_at?: string | null
          sla_first_response_at?: string | null
          sla_paused_at?: string | null
          sla_paused_total_seconds?: number | null
          sla_resolution_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
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
          created_at?: string
          created_by?: string
          delivery_date?: string | null
          description?: string | null
          first_responded_at?: string | null
          has_original_packaging?: boolean | null
          id?: string
          is_assembled?: boolean | null
          is_exhibition?: boolean | null
          is_personalized?: boolean | null
          needs_tpa?: boolean | null
          order_number?: string | null
          payment_method?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          purchase_date?: string | null
          resolved_at?: string | null
          sla_first_response_at?: string | null
          sla_paused_at?: string | null
          sla_paused_total_seconds?: number | null
          sla_resolution_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
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
      app_role: "agent" | "supervisor"
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
      ticket_status:
        | "novo"
        | "em_analise"
        | "aguarda_cliente"
        | "aguarda_logistica"
        | "aguarda_tecnico"
        | "resolvido"
        | "encerrado"
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
      app_role: ["agent", "supervisor"],
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
      ticket_status: [
        "novo",
        "em_analise",
        "aguarda_cliente",
        "aguarda_logistica",
        "aguarda_tecnico",
        "resolvido",
        "encerrado",
      ],
    },
  },
} as const
