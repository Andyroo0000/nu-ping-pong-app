// Hand-written to match supabase/migrations/0001_init.sql, in the shape
// @supabase/supabase-js expects from `supabase gen types typescript`.
// If you change the schema, regenerate with:
//   npx supabase gen types typescript --project-id <ref> > lib/database.types.ts

export type MatchGame = { a: number; b: number };
export type MatchStatus = "pending" | "confirmed" | "declined";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          full_name: string;
          rating: number;
          wins: number;
          losses: number;
          created_at: string;
        };
        Insert: {
          id: string;
          username: string;
          full_name: string;
          rating?: number;
          wins?: number;
          losses?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      matches: {
        Row: {
          id: string;
          player_a: string;
          player_b: string;
          games: MatchGame[];
          games_won_a: number;
          games_won_b: number;
          winner: string;
          reported_by: string;
          status: MatchStatus;
          rating_delta: number | null;
          played_at: string;
          confirmed_at: string | null;
        };
        Insert: {
          id?: string;
          player_a: string;
          player_b: string;
          games: MatchGame[];
          games_won_a: number;
          games_won_b: number;
          winner: string;
          reported_by: string;
          status?: MatchStatus;
          rating_delta?: number | null;
          played_at?: string;
          confirmed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["matches"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "matches_player_a_fkey";
            columns: ["player_a"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_player_b_fkey";
            columns: ["player_b"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_winner_fkey";
            columns: ["winner"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_reported_by_fkey";
            columns: ["reported_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      rating_history: {
        Row: {
          id: number;
          player_id: string;
          match_id: string | null;
          rating: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          player_id: string;
          match_id?: string | null;
          rating: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["rating_history"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "rating_history_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rating_history_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      confirm_match: { Args: { p_match_id: string }; Returns: undefined };
      decline_match: { Args: { p_match_id: string }; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
