export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          timezone: string;
          reminder_time: string | null;
          onboarding_completed: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          timezone?: string;
          reminder_time?: string | null;
          onboarding_completed?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          timezone?: string;
          reminder_time?: string | null;
          onboarding_completed?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      priorities: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          colour: string;
          icon: string | null;
          why_statement: string;
          weekly_target_minutes: number;
          sort_order: number;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          colour?: string;
          icon?: string | null;
          why_statement: string;
          weekly_target_minutes?: number;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          colour?: string;
          icon?: string | null;
          why_statement?: string;
          weekly_target_minutes?: number;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      daily_checkins: {
        Row: {
          id: string;
          user_id: string;
          checkin_date: string;
          mood: number | null;
          energy: number | null;
          bedtime: string | null;
          wake_time: string | null;
          sleep_minutes: number | null;
          water_glasses: number | null;
          meal_quality: 'balanced' | 'okay' | 'skipped' | null;
          wasted_minutes: number;
          private_note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          checkin_date?: string;
          mood?: number | null;
          energy?: number | null;
          bedtime?: string | null;
          wake_time?: string | null;
          sleep_minutes?: number | null;
          water_glasses?: number | null;
          meal_quality?: 'balanced' | 'okay' | 'skipped' | null;
          wasted_minutes?: number;
          private_note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          checkin_date?: string;
          mood?: number | null;
          energy?: number | null;
          bedtime?: string | null;
          wake_time?: string | null;
          sleep_minutes?: number | null;
          water_glasses?: number | null;
          meal_quality?: 'balanced' | 'okay' | 'skipped' | null;
          wasted_minutes?: number;
          private_note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      time_entries: {
        Row: {
          id: string;
          user_id: string;
          checkin_id: string;
          priority_id: string;
          minutes: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          checkin_id: string;
          priority_id: string;
          minutes?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          checkin_id?: string;
          priority_id?: string;
          minutes?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      experiments: {
        Row: {
          id: string;
          user_id: string;
          target_priority_id: string;
          transfer_minutes_per_day: number;
          starts_on: string;
          ends_on: string;
          status: 'active' | 'completed' | 'cancelled';
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          target_priority_id: string;
          transfer_minutes_per_day?: number;
          starts_on: string;
          ends_on: string;
          status?: 'active' | 'completed' | 'cancelled';
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          target_priority_id?: string;
          transfer_minutes_per_day?: number;
          starts_on?: string;
          ends_on?: string;
          status?: 'active' | 'completed' | 'cancelled';
          created_at?: string;
        };
        Relationships: [];
      };
      weekly_reports: {
        Row: {
          id: string;
          user_id: string;
          week_start: string;
          alignment_score: number;
          target_completion_percent: number;
          letter: string;
          sheet_synced_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          week_start: string;
          alignment_score: number;
          target_completion_percent: number;
          letter: string;
          sheet_synced_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          week_start?: string;
          alignment_score?: number;
          target_completion_percent?: number;
          letter?: string;
          sheet_synced_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Priority = Database['public']['Tables']['priorities']['Row'];
export type DailyCheckin = Database['public']['Tables']['daily_checkins']['Row'];
export type TimeEntry = Database['public']['Tables']['time_entries']['Row'];
export type Experiment = Database['public']['Tables']['experiments']['Row'];
export type WeeklyReport = Database['public']['Tables']['weekly_reports']['Row'];
