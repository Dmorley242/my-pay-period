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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_holds: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          goal_amount: number | null
          hold_name: string
          hold_type: string
          id: string
          notes: string | null
          released_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          goal_amount?: number | null
          hold_name: string
          hold_type?: string
          id?: string
          notes?: string | null
          released_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          goal_amount?: number | null
          hold_name?: string
          hold_type?: string
          id?: string
          notes?: string | null
          released_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      accounts: {
        Row: {
          account_type: string | null
          bank_name: string | null
          created_at: string
          current_balance: number
          id: string
          name: string
          notes: string | null
          starting_balance: number
          user_id: string
        }
        Insert: {
          account_type?: string | null
          bank_name?: string | null
          created_at?: string
          current_balance?: number
          id?: string
          name: string
          notes?: string | null
          starting_balance?: number
          user_id: string
        }
        Update: {
          account_type?: string | null
          bank_name?: string | null
          created_at?: string
          current_balance?: number
          id?: string
          name?: string
          notes?: string | null
          starting_balance?: number
          user_id?: string
        }
        Relationships: []
      }
      budget_items: {
        Row: {
          account_id: string
          budget_amount: number
          created_at: string
          id: string
          is_recurring: boolean
          name: string
          notes: string | null
          pay_period_id: string
          recurring_amount: number | null
          recurring_date: number | null
          recurring_frequency: string | null
          recurring_name: string | null
          source_template_id: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          budget_amount?: number
          created_at?: string
          id?: string
          is_recurring?: boolean
          name: string
          notes?: string | null
          pay_period_id: string
          recurring_amount?: number | null
          recurring_date?: number | null
          recurring_frequency?: string | null
          recurring_name?: string | null
          source_template_id?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          budget_amount?: number
          created_at?: string
          id?: string
          is_recurring?: boolean
          name?: string
          notes?: string | null
          pay_period_id?: string
          recurring_amount?: number | null
          recurring_date?: number | null
          recurring_frequency?: string | null
          recurring_name?: string | null
          source_template_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      budget_sub_items: {
        Row: {
          amount: number
          budget_item_id: string
          created_at: string
          id: string
          is_recurring: boolean
          name: string
          recurring_amount: number | null
          recurring_date: number | null
          recurring_frequency: string | null
          recurring_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          budget_item_id: string
          created_at?: string
          id?: string
          is_recurring?: boolean
          name: string
          recurring_amount?: number | null
          recurring_date?: number | null
          recurring_frequency?: string | null
          recurring_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          budget_item_id?: string
          created_at?: string
          id?: string
          is_recurring?: boolean
          name?: string
          recurring_amount?: number | null
          recurring_date?: number | null
          recurring_frequency?: string | null
          recurring_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_sub_items_budget_item_id_fkey"
            columns: ["budget_item_id"]
            isOneToOne: false
            referencedRelation: "budget_items"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_template_items: {
        Row: {
          account_id: string
          budget_amount: number
          created_at: string
          id: string
          is_recurring: boolean
          name: string
          recurring_amount: number | null
          recurring_date: number | null
          recurring_frequency: string | null
          recurring_name: string | null
          template_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          budget_amount?: number
          created_at?: string
          id?: string
          is_recurring?: boolean
          name: string
          recurring_amount?: number | null
          recurring_date?: number | null
          recurring_frequency?: string | null
          recurring_name?: string | null
          template_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          budget_amount?: number
          created_at?: string
          id?: string
          is_recurring?: boolean
          name?: string
          recurring_amount?: number | null
          recurring_date?: number | null
          recurring_frequency?: string | null
          recurring_name?: string | null
          template_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "budget_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_template_sub_items: {
        Row: {
          amount: number
          created_at: string
          id: string
          is_recurring: boolean
          name: string
          recurring_amount: number | null
          recurring_date: number | null
          recurring_frequency: string | null
          recurring_name: string | null
          template_item_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          is_recurring?: boolean
          name: string
          recurring_amount?: number | null
          recurring_date?: number | null
          recurring_frequency?: string | null
          recurring_name?: string | null
          template_item_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          is_recurring?: boolean
          name?: string
          recurring_amount?: number | null
          recurring_date?: number | null
          recurring_frequency?: string | null
          recurring_name?: string | null
          template_item_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      budget_templates: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          category_type: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          category_type: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          category_type?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      pay_periods: {
        Row: {
          created_at: string
          end_date: string
          id: string
          income_source: string | null
          is_active: boolean
          name: string
          net_pay_amount: number | null
          notes: string | null
          paycheck_account_id: string | null
          paycheck_transaction_id: string | null
          start_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          income_source?: string | null
          is_active?: boolean
          name: string
          net_pay_amount?: number | null
          notes?: string | null
          paycheck_account_id?: string | null
          paycheck_transaction_id?: string | null
          start_date: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          income_source?: string | null
          is_active?: boolean
          name?: string
          net_pay_amount?: number | null
          notes?: string | null
          paycheck_account_id?: string | null
          paycheck_transaction_id?: string | null
          start_date?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      recurring_expense_applications: {
        Row: {
          applied_at: string
          budget_item_id: string | null
          budget_sub_item_id: string | null
          id: string
          pay_period_id: string
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          applied_at?: string
          budget_item_id?: string | null
          budget_sub_item_id?: string | null
          id?: string
          pay_period_id: string
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          applied_at?: string
          budget_item_id?: string | null
          budget_sub_item_id?: string | null
          id?: string
          pay_period_id?: string
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          account_id: string
          amount: number
          budget_item_id: string | null
          category_id: string | null
          created_at: string
          date: string
          id: string
          notes: string | null
          pay_period_id: string | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          budget_item_id?: string | null
          category_id?: string | null
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          pay_period_id?: string | null
          transaction_type: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          budget_item_id?: string | null
          category_id?: string | null
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          pay_period_id?: string | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_pay_period_id_fkey"
            columns: ["pay_period_id"]
            isOneToOne: false
            referencedRelation: "pay_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          amount: number
          created_at: string
          date: string
          from_account_id: string
          id: string
          notes: string | null
          pay_period_id: string | null
          to_account_id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          date?: string
          from_account_id: string
          id?: string
          notes?: string | null
          pay_period_id?: string | null
          to_account_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          from_account_id?: string
          id?: string
          notes?: string | null
          pay_period_id?: string | null
          to_account_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_pay_period_id_fkey"
            columns: ["pay_period_id"]
            isOneToOne: false
            referencedRelation: "pay_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
