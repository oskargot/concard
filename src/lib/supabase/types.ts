// Hand-maintained mirror of supabase/migrations. Regenerate with the Supabase CLI
// once the project is linked:  supabase gen types typescript --linked > src/lib/supabase/types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type StickerRarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type StickerSource = 'starter' | 'drop' | 'shop' | 'event';
export type StickerFoil = 'none' | 'glitter' | 'holo';

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
					is_admin: boolean;
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
			fandoms: {
				Row: {
					id: string;
					name: string;
					mark: string;
					color_a: string;
					color_b: string;
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
					art_url: string | null;
					art_x: number;
					art_y: number;
					art_scale: number;
					style: Json;
					affiliation: string | null;
					affiliation_x: number;
					affiliation_y: number;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					owner_id: string;
					art_url?: string | null;
					art_x?: number;
					art_y?: number;
					art_scale?: number;
					style?: Json;
					affiliation?: string | null;
					affiliation_x?: number;
					affiliation_y?: number;
				};
				Update: {
					art_url?: string | null;
					art_x?: number;
					art_y?: number;
					art_scale?: number;
					style?: Json;
					affiliation?: string | null;
					affiliation_x?: number;
					affiliation_y?: number;
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
				Insert: {
					id: string;
					name: string;
					glyph?: string | null;
					image_url?: string | null;
					rarity?: StickerRarity;
					source?: StickerSource;
					price_cents?: number | null;
					sort_order?: number;
					is_active?: boolean;
				};
				Update: {
					name?: string;
					glyph?: string | null;
					image_url?: string | null;
					rarity?: StickerRarity;
					source?: StickerSource;
					price_cents?: number | null;
					sort_order?: number;
					is_active?: boolean;
				};
				Relationships: [];
			};
			sticker_inventory: {
				Row: {
					owner_id: string;
					sticker_id: string;
					foil: StickerFoil;
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
					foil: StickerFoil;
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
					foil?: StickerFoil;
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
					bonus_foil: StickerFoil;
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
				Args: { p_owner_id: string; p_sticker_id: string; p_foil?: StickerFoil };
				Returns: number;
			};
			combine_stickers: {
				Args: { p_sticker_id: string; p_foil?: StickerFoil };
				Returns: Json;
			};
		};
		Enums: {
			sticker_rarity: StickerRarity;
			sticker_source: StickerSource;
			sticker_foil: StickerFoil;
		};
		CompositeTypes: Record<string, never>;
	};
}

export type Tables<T extends keyof Database['public']['Tables']> =
	Database['public']['Tables'][T]['Row'];
