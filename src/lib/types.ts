import type { Tables, StickerFoil } from '$lib/supabase/types';
import type { CardStyle } from '$lib/card-style';
import type { FandomStyleCategory } from '$lib/stickers/types';

export type { StickerFoil };

export type Profile = Tables<'profiles'>;
export type Card = Tables<'cards'>;
export type Fandom = Tables<'fandoms'>;
export type Sticker = Tables<'stickers'>;
export type StickerPlacement = Tables<'sticker_placements'>;
export type Collection = Tables<'collections'>;

/** A link on a profile, as the profile editor stores it (`profiles.links`). */
export interface ProfileLink {
	label: string;
	url: string;
}

/**
 * A link pill (card spec §3.5, §8), as concard-app's `CardLink`: its position
 * is its index, its icon comes from the url's domain when drawn. The synced
 * `app-card/links.ts` reads and writes this shape.
 */
export interface CardLink {
	url: string;
	/** Shown on the pill. Pre-filled from the url, then the user's to edit. */
	handle: string;
}

/**
 * The fandom affiliation as rendered on a card — concard-app's `Affiliation`:
 * enough to redraw the generative sticker forever without a fandoms lookup.
 */
export interface Affiliation {
	id: string;
	name: string;
	style_category: FandomStyleCategory;
	/** Placed on the face like a sticker: 0..1 of the card, centre of the sticker. */
	x: number;
	y: number;
	rotation: number;
	scale: number;
	foil: StickerFoil;
}

/**
 * A sticker as positioned on a card face: its centre as 0..1 of the card, and
 * `scale` of its base `size` (a fraction of the card's width). A v4 snapshot's
 * copy also carries what the sticker is, so it draws with no catalog lookup —
 * the same shape as concard-app's `PlacedSticker`.
 */
export interface PlacedSticker {
	id?: string;
	sticker_id: string;
	x: number;
	y: number;
	rotation: number;
	scale: number;
	z_index: number;
	foil: StickerFoil;
	size?: number | null;
	/** The card's free fandom affiliation, as a placement. */
	is_affiliation?: boolean;
	kind?: 'deco' | 'fandom';
	name?: string;
	full_path?: string | null;
	mask_path?: string | null;
	thumb_path?: string | null;
	art_aspect?: number | null;
	fandom_id?: string | null;
	label?: string;
	style_category?: string;
}

/**
 * Everything needed to draw a card front — concard-app's `CardView`. Live cards
 * and frozen collection snapshots both reduce to this shape, so one component
 * renders both, identically to the app.
 */
export interface CardView {
	/** Display name on the card. */
	title: string;
	/** Owner's username, shown as @handle. */
	handle: string;
	pronouns?: string | null;
	bio: string;
	/** The owner's name for this card in their switcher; never drawn. */
	label?: string | null;
	art_url: string | null;
	/** The photo's focal point, 0..1 of the image, and its zoom (>= 1). */
	art_x: number;
	art_y: number;
	art_scale: number;
	style: CardStyle;
	affiliation: Affiliation | null;
	links: CardLink[];
	stickers: PlacedSticker[];
}

/** A collection snapshot, read into a view plus who and what it was. */
export interface CardSnapshot extends CardView {
	/** The snapshot format it was written in (1–4). */
	version: number;
	card_id: string;
	owner: {
		id: string;
		username: string;
		display_name: string;
		avatar_url: string | null;
	};
}
