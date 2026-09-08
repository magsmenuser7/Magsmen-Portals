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
      call_participants: {
        Row: {
          call_id: string
          invited_at: string
          is_host: boolean
          joined_at: string | null
          left_at: string | null
          status: Database["public"]["Enums"]["call_participant_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          call_id: string
          invited_at?: string
          is_host?: boolean
          joined_at?: string | null
          left_at?: string | null
          status?: Database["public"]["Enums"]["call_participant_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          call_id?: string
          invited_at?: string
          is_host?: boolean
          joined_at?: string | null
          left_at?: string | null
          status?: Database["public"]["Enums"]["call_participant_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_participants_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          answered_at: string | null
          call_type: Database["public"]["Enums"]["call_type"]
          caller_id: string
          channel_id: string | null
          created_at: string
          duration_seconds: number
          end_reason: string | null
          ended_at: string | null
          ended_by: string | null
          id: string
          is_group: boolean
          receiver_id: string | null
          room_name: string
          started_at: string | null
          status: Database["public"]["Enums"]["call_status"]
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          answered_at?: string | null
          call_type?: Database["public"]["Enums"]["call_type"]
          caller_id: string
          channel_id?: string | null
          created_at?: string
          duration_seconds?: number
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          is_group?: boolean
          receiver_id?: string | null
          room_name: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["call_status"]
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          answered_at?: string | null
          call_type?: Database["public"]["Enums"]["call_type"]
          caller_id?: string
          channel_id?: string | null
          created_at?: string
          duration_seconds?: number
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          is_group?: boolean
          receiver_id?: string | null
          room_name?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["call_status"]
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_channels: {
        Row: {
          archived_at: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          kind: string
          member_ids: string[]
          name: string
          portals: string[]
          room_type: string
          task_id: string | null
        }
        Insert: {
          archived_at?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          member_ids?: string[]
          name: string
          portals?: string[]
          room_type?: string
          task_id?: string | null
        }
        Update: {
          archived_at?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          member_ids?: string[]
          name?: string
          portals?: string[]
          room_type?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_channels_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_channels_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          attachment_mime: string | null
          attachment_name: string | null
          attachment_size: number | null
          attachment_url: string | null
          author_id: string | null
          author_name: string
          body: string
          channel_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          kind: string
        }
        Insert: {
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_size?: number | null
          attachment_url?: string | null
          author_id?: string | null
          author_name?: string
          body: string
          channel_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          kind?: string
        }
        Update: {
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_size?: number | null
          attachment_url?: string | null
          author_id?: string | null
          author_name?: string
          body?: string
          channel_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_participants: {
        Row: {
          channel_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_participants_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_reactions: {
        Row: {
          channel_id: string
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_reactions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_reads: {
        Row: {
          channel_id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_reads_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      clickup_status_map: {
        Row: {
          clickup_status: string
          created_at: string
          id: string
          internal_status: Database["public"]["Enums"]["task_status"]
          updated_at: string
        }
        Insert: {
          clickup_status: string
          created_at?: string
          id?: string
          internal_status: Database["public"]["Enums"]["task_status"]
          updated_at?: string
        }
        Update: {
          clickup_status?: string
          created_at?: string
          id?: string
          internal_status?: Database["public"]["Enums"]["task_status"]
          updated_at?: string
        }
        Relationships: []
      }
      clickup_sync_log: {
        Row: {
          clickup_task_id: string | null
          created_at: string
          direction: string
          error_message: string | null
          id: string
          last_synced_at: string | null
          sync_status: Database["public"]["Enums"]["sync_status"]
          task_id: string | null
        }
        Insert: {
          clickup_task_id?: string | null
          created_at?: string
          direction?: string
          error_message?: string | null
          id?: string
          last_synced_at?: string | null
          sync_status?: Database["public"]["Enums"]["sync_status"]
          task_id?: string | null
        }
        Update: {
          clickup_task_id?: string | null
          created_at?: string
          direction?: string
          error_message?: string | null
          id?: string
          last_synced_at?: string | null
          sync_status?: Database["public"]["Enums"]["sync_status"]
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clickup_sync_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          company_name: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          company_name?: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          company_name?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      meeting_participants: {
        Row: {
          created_at: string
          id: string
          joined_at: string | null
          left_at: string | null
          meeting_id: string
          response_status: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          joined_at?: string | null
          left_at?: string | null
          meeting_id: string
          response_status?: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          joined_at?: string | null
          left_at?: string | null
          meeting_id?: string
          response_status?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_participants_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          agenda: string
          attendee_ids: string[]
          cancelled_at: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          duration_mins: number
          ended_at: string | null
          host_id: string | null
          host_name: string
          id: string
          last_zoom_event: string | null
          last_zoom_event_at: string | null
          link: string
          portals: string[]
          project: string
          started_at: string | null
          starts_at: string
          status: string
          timezone: string
          title: string
          updated_at: string
          zoom_join_url: string | null
          zoom_meeting_id: string | null
          zoom_start_url: string | null
          zoom_uuid: string | null
        }
        Insert: {
          agenda?: string
          attendee_ids?: string[]
          cancelled_at?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_mins?: number
          ended_at?: string | null
          host_id?: string | null
          host_name?: string
          id?: string
          last_zoom_event?: string | null
          last_zoom_event_at?: string | null
          link?: string
          portals?: string[]
          project?: string
          started_at?: string | null
          starts_at: string
          status?: string
          timezone?: string
          title: string
          updated_at?: string
          zoom_join_url?: string | null
          zoom_meeting_id?: string | null
          zoom_start_url?: string | null
          zoom_uuid?: string | null
        }
        Update: {
          agenda?: string
          attendee_ids?: string[]
          cancelled_at?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_mins?: number
          ended_at?: string | null
          host_id?: string | null
          host_name?: string
          id?: string
          last_zoom_event?: string | null
          last_zoom_event_at?: string | null
          link?: string
          portals?: string[]
          project?: string
          started_at?: string | null
          starts_at?: string
          status?: string
          timezone?: string
          title?: string
          updated_at?: string
          zoom_join_url?: string | null
          zoom_meeting_id?: string | null
          zoom_start_url?: string | null
          zoom_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          link: string | null
          meeting_id: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          meeting_id?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          meeting_id?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      task_activity: {
        Row: {
          changed_by: string | null
          changed_by_name: string
          created_at: string
          id: string
          note: string
          status: Database["public"]["Enums"]["task_status"] | null
          task_id: string
        }
        Insert: {
          changed_by?: string | null
          changed_by_name?: string
          created_at?: string
          id?: string
          note?: string
          status?: Database["public"]["Enums"]["task_status"] | null
          task_id: string
        }
        Update: {
          changed_by?: string | null
          changed_by_name?: string
          created_at?: string
          id?: string
          note?: string
          status?: Database["public"]["Enums"]["task_status"] | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          clickup_task_id: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          description: string
          due_date: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          status: Database["public"]["Enums"]["task_status"]
          tags: string[]
          task_ref: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          clickup_task_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          tags?: string[]
          task_ref?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          clickup_task_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          tags?: string[]
          task_ref?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          clickup_user_id: string | null
          created_at: string
          email: string
          id: string
          is_super_admin: boolean
          name: string
          phone: string | null
          role_title: string
          user_id: string | null
        }
        Insert: {
          clickup_user_id?: string | null
          created_at?: string
          email: string
          id?: string
          is_super_admin?: boolean
          name: string
          phone?: string | null
          role_title?: string
          user_id?: string | null
        }
        Update: {
          clickup_user_id?: string | null
          created_at?: string
          email?: string
          id?: string
          is_super_admin?: boolean
          name?: string
          phone?: string | null
          role_title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          role_title: string | null
        }
        Insert: {
          created_at?: string
          email?: string
          id: string
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          role_title?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          role_title?: string | null
        }
        Relationships: []
      }
      zoom_webhook_events: {
        Row: {
          event_key: string
          event_type: string
          id: string
          payload: Json | null
          received_at: string
          zoom_meeting_id: string | null
        }
        Insert: {
          event_key: string
          event_type: string
          id?: string
          payload?: Json | null
          received_at?: string
          zoom_meeting_id?: string | null
        }
        Update: {
          event_key?: string
          event_type?: string
          id?: string
          payload?: Json | null
          received_at?: string
          zoom_meeting_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_call_user: {
        Args: { _caller: string; _receiver: string }
        Returns: boolean
      }
      can_join_chat_channel: { Args: { _channel: string }; Returns: boolean }
      can_join_group_call: {
        Args: { _channel: string; _user: string }
        Returns: boolean
      }
      can_view_meeting: { Args: { _meeting: string }; Returns: boolean }
      chat_directory: {
        Args: never
        Returns: {
          company: string
          email: string
          name: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      current_app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      expire_stale_calls: {
        Args: { _timeout_seconds?: number }
        Returns: number
      }
      has_active_call: { Args: { _user: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_call_member: {
        Args: { _call: string; _user: string }
        Returns: boolean
      }
      is_chat_participant: { Args: { _channel: string }; Returns: boolean }
      is_meeting_participant: { Args: { _meeting: string }; Returns: boolean }
      my_client_id: { Args: never; Returns: string }
      my_team_member_id: { Args: never; Returns: string }
    }
    Enums: {
      app_role: "client" | "team" | "admin"
      call_participant_status:
        | "ringing"
        | "accepted"
        | "declined"
        | "joined"
        | "left"
        | "missed"
        | "failed"
      call_status:
        | "initiating"
        | "ringing"
        | "accepted"
        | "connecting"
        | "connected"
        | "reconnecting"
        | "declined"
        | "cancelled"
        | "missed"
        | "busy"
        | "ended"
        | "failed"
      call_type: "audio" | "video" | "screen_share"
      sync_status: "synced" | "pending" | "failed"
      task_priority: "low" | "normal" | "high" | "urgent"
      task_status:
        | "todo"
        | "in_progress"
        | "in_review"
        | "completed"
        | "rejected"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["client", "team", "admin"],
      call_participant_status: [
        "ringing",
        "accepted",
        "declined",
        "joined",
        "left",
        "missed",
        "failed",
      ],
      call_status: [
        "initiating",
        "ringing",
        "accepted",
        "connecting",
        "connected",
        "reconnecting",
        "declined",
        "cancelled",
        "missed",
        "busy",
        "ended",
        "failed",
      ],
      call_type: ["audio", "video", "screen_share"],
      sync_status: ["synced", "pending", "failed"],
      task_priority: ["low", "normal", "high", "urgent"],
      task_status: [
        "todo",
        "in_progress",
        "in_review",
        "completed",
        "rejected",
      ],
    },
  },
} as const
