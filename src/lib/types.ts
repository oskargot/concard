import type { Tables } from '$lib/supabase/types';
import type { CardStyle } from '$lib/card-style';

export type Profile = Tables<'profiles'>;
export type Card = Tables<'cards'>;
export type Fandom = Tables<'fandoms'>;
export type Sticker = Tables<'stickers'>;
export type StickerPlacement = Tables<'sticker_placements'>;
export type Collection = Tables<'collections'>;

export interface ProfileLink {
	label: string;
	url: string;
}

/** The fandom badge as rendered on a card; frozen into snapshots. */
export interface Affiliation {
	id: string;
	name: string;
	mark: string;
	color_a: string;
	color_b: string;
	/** Placed on the face like a sticker: 0..1 of the card, centre of the badge. */
	x: number;
	y: number;
}

/** A sticker as positioned on a card face. Positions are 0..1 of the card size. */
export interface PlacedSticker {
	id?: string;
	sticker_id: string;
	x: number;
	y: number;
	rotation: number;
	scale: number;
	z_index: number;
}

/**
 * Everything needed to draw a card front. Live cards and frozen collection
 * snapshots both reduce to this shape, so one component renders both.
 */
export interface CardView {
	/** display name on the card */
	title: string;
	/** owner's username, shown as @handle */
	handle: string;
	bio: string;
	art_url: string | null;
	style: CardStyle;
	affiliation: Affiliation | null;
	links: ProfileLink[];
	stickers: PlacedSticker[];
}

/** Shape written by collect_card() into collections.card_snapshot (version 2). */
export interface CardSnapshot extends CardView {
	version: 2;
	card_id: string;
	owner: {
		id: string;
		username: string;
		display_name: string;
		avatar_url: string | null;
	};
}
