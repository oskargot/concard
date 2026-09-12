// Hand-maintained mirror of supabase/migrations. Regenerate with the Supabase CLI
// once the project is linked:  supabase gen types typescript --linked > src/lib/supabase/types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type StickerRarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type StickerSource = 'starter' | 'drop' | 'shop' | 'event';

export interface Database {
	public: {
		Tables: {
			profiles: {
				Row: {
					id: string;
					username: string;
					display_name: string;
					bio: string;
					avatar_url: string | null;
					links: Json;
					active_card_id: string | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id: string;
					username: string;
					display_name: string;
					bio?: string;
					avatar_url?: string | null;
					links?: Json;
					active_card_id?: string | null;
				};
				Update: {
					username?: string;
					display_name?: string;
					bio?: string;
					avatar_url?: string | null;
					links?: Json;
					active_card_id?: string | null;
				};
				Relationships: [];
			};
			card_templates: {
				Row: {
					id: string;
					name: string;
					description: string;
					config: Json;
					sort_order: number;
					is_active: boolean;
				};
				Insert: never;
				Update: never;
				Relationships: [];
			};
			cards: {
				Row: {
					id: string;
					owner_id: string;
					template_id: string;
					title: string;
					subtitle: string;
					flavor_text: string;
					art_url: string | null;
					colors: Json;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					owner_id: string;
					template_id: string;
					title: string;
					subtitle?: string;
					flavor_text?: string;
					art_url?: string | null;
					colors?: Json;
				};
				Update: {
					template_id?: string;
					title?: string;
					subtitle?: string;
					flavor_text?: string;
					art_url?: string | null;
					colors?: Json;
				};
				Relationships: [];
			};
			stickers: {
				Row: {
					id: string;
					name: string;
					glyph: string | null;
					image_url: string | null;
					rarity: StickerRarity;
					source: StickerSource;
					price_cents: number | null;
					sort_order: number;
					is_active: boolean;
				};
				Insert: never;
				Update: never;
				Relationships: [];
			};
			sticker_inventory: {
				Row: {
					owner_id: string;
					sticker_id: string;
					quantity: number;
					updated_at: string;
				};
				Insert: never;
				Update: never;
				Relationships: [];
			};
			sticker_placements: {
				Row: {
					id: string;
					card_id: string;
					sticker_id: string;
					x: number;
					y: number;
					rotation: number;
					scale: number;
					z_index: number;
					created_at: string;
				};
				Insert: {
					id?: string;
					card_id: string;
					sticker_id: string;
					x: number;
					y: number;
					rotation?: number;
					scale?: number;
					z_index?: number;
				};
				Update: {
					x?: number;
					y?: number;
					rotation?: number;
					scale?: number;
					z_index?: number;
				};
				Relationships: [];
			};
			collections: {
				Row: {
					id: string;
					collector_id: string;
					owner_id: string;
					card_id: string | null;
					card_snapshot: Json;
					bonus_sticker_id: string | null;
					event_id: string | null;
					collected_at: string;
				};
				Insert: never;
				Update: never;
				Relationships: [];
			};
			reserved_usernames: {
				Row: { username: string };
				Insert: never;
				Update: never;
				Relationships: [];
			};
		};
		Views: Record<string, never>;
		Functions: {
			collect_card: {
				Args: { target_username: string };
				Returns: Json;
			};
			is_username_available: {
				Args: { candidate: string };
				Returns: boolean;
			};
			sticker_available_count: {
				Args: { p_owner_id: string; p_sticker_id: string };
				Returns: number;
			};
		};
		Enums: {
			sticker_rarity: StickerRarity;
			sticker_source: StickerSource;
		};
		CompositeTypes: Record<string, never>;
	};
}

export type Tables<T extends keyof Database['public']['Tables']> =
	Database['public']['Tables'][T]['Row'];
