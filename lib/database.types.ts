// Hand-written to match supabase/migrations/0001_init.sql, in the shape
// @supabase/supabase-js expects from `supabase gen types typescript`.
// If you change the schema, regenerate with:
//   npx supabase gen types typescript --project-id <ref> > lib/database.types.ts

export type MatchGame = { a: number; b: number };
export type MatchStatus = "pending" | "confirmed" | "declined";
export type ChallengeStatus = "pending" | "accepted" | "declined" | "cancelled";
export type ChannelKind = "match" | "club";
export type MessageKind = "user" | "system";
export type PlayStyle = "quick" | "long";
export type PlayPreference = "casual" | "competitive" | "both";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          full_name: string | null;
          rating: number;
          wins: number;
          losses: number;
          created_at: string;
          bio: string | null;
          year: string | null;
          home_hall: string | null;
          availability: string[];
          play_preference: PlayPreference;
          avatar_path: string | null;
          notify_challenges: boolean;
          notify_messages: boolean;
          notify_confirmations: boolean;
        };
        Insert: {
          id: string;
          username: string;
          full_name?: string | null;
          rating?: number;
          wins?: number;
          losses?: number;
          created_at?: string;
          bio?: string | null;
          year?: string | null;
          home_hall?: string | null;
          availability?: string[];
          play_preference?: PlayPreference;
          avatar_path?: string | null;
          notify_challenges?: boolean;
          notify_messages?: boolean;
          notify_confirmations?: boolean;
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
          is_ranked: boolean;
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
          is_ranked?: boolean;
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
      channels: {
        Row: {
          id: string;
          kind: ChannelKind;
          title: string | null;
          created_at: string;
          last_message_at: string;
        };
        Insert: {
          id?: string;
          kind?: ChannelKind;
          title?: string | null;
          created_at?: string;
          last_message_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["channels"]["Insert"]>;
        Relationships: [];
      };
      channel_members: {
        Row: {
          channel_id: string;
          user_id: string;
          joined_at: string;
          last_read_at: string;
        };
        Insert: {
          channel_id: string;
          user_id: string;
          joined_at?: string;
          last_read_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["channel_members"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "channel_members_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "channel_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          id: number;
          channel_id: string;
          author_id: string | null;
          body: string;
          kind: MessageKind;
          created_at: string;
        };
        Insert: {
          id?: number;
          channel_id: string;
          author_id?: string | null;
          body: string;
          kind?: MessageKind;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "messages_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      challenges: {
        Row: {
          id: string;
          challenger: string;
          opponent: string;
          note: string | null;
          status: ChallengeStatus;
          channel_id: string | null;
          created_at: string;
          responded_at: string | null;
        };
        Insert: {
          id?: string;
          challenger: string;
          opponent: string;
          note?: string | null;
          status?: ChallengeStatus;
          channel_id?: string | null;
          created_at?: string;
          responded_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["challenges"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "challenges_challenger_fkey";
            columns: ["challenger"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "challenges_opponent_fkey";
            columns: ["opponent"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          endpoint: string;
          user_id: string;
          p256dh: string;
          auth: string;
          user_agent: string | null;
          created_at: string;
          last_used_at: string | null;
        };
        Insert: {
          endpoint: string;
          user_id: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
          created_at?: string;
          last_used_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["push_subscriptions"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      queue_entries: {
        Row: {
          user_id: string;
          location: string | null;
          note: string | null;
          play_style: PlayStyle;
          joined_at: string;
          expires_at: string;
        };
        Insert: {
          user_id: string;
          location?: string | null;
          note?: string | null;
          play_style?: PlayStyle;
          joined_at?: string;
          expires_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["queue_entries"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "queue_entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      // queue_entries filtered to rows that haven't expired yet.
      active_queue: {
        Row: {
          user_id: string;
          location: string | null;
          note: string | null;
          play_style: PlayStyle;
          joined_at: string;
          expires_at: string;
        };
        Relationships: [
          {
            foreignKeyName: "queue_entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      confirm_match: { Args: { p_match_id: string }; Returns: undefined };
      decline_match: { Args: { p_match_id: string }; Returns: undefined };
      send_challenge: {
        Args: { p_opponent: string; p_note?: string | null };
        Returns: string;
      };
      respond_challenge: {
        Args: { p_challenge_id: string; p_accept: boolean };
        Returns: string;
      };
      join_queue: {
        Args: {
          p_location?: string | null;
          p_note?: string | null;
          p_play_style?: PlayStyle;
        };
        Returns: undefined;
      };
      leave_queue: { Args: Record<string, never>; Returns: undefined };
      find_match: { Args: { p_play_style?: PlayStyle | null }; Returns: string | null };
      find_match_in_hall: {
        Args: { p_hall: string; p_play_style?: PlayStyle };
        Returns: string | null;
      };
      pair_with_player: { Args: { p_opponent: string }; Returns: string };
      casual_record: {
        Args: { p_player: string };
        Returns: { wins: number; losses: number }[];
      };
      queue_elsewhere: {
        Args: { p_hall?: string | null };
        Returns: {
          user_id: string;
          username: string;
          full_name: string | null;
          rating: number;
          location: string | null;
          note: string | null;
          play_style: PlayStyle;
          joined_at: string;
        }[];
      };
      nav_summary: {
        Args: Record<string, never>;
        Returns: { username: string; unread: number; pending_challenges: number }[];
      };
      mark_channel_read: { Args: { p_channel_id: string }; Returns: undefined };
      unread_summary: {
        Args: Record<string, never>;
        Returns: { channel_id: string; unread: number }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
