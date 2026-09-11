import type { Tables } from '$lib/supabase/types';

export type Profile = Tables<'profiles'>;
export type Card = Tables<'cards'>;
export type CardTemplate = Tables<'card_templates'>;
export type Sticker = Tables<'stickers'>;
export type StickerPlacement = Tables<'sticker_placements'>;
export type Collection = Tables<'collections'>;

export interface ProfileLink {
	label: string;
	url: string;
}

export interface CardColors {
	primary?: string;
	secondary?: string;
	accent?: string;
}

export interface TemplateConfig {
	frame?: 'solid' | 'gradient' | 'pixel' | 'none';
	font?: 'serif' | 'sans' | 'mono';
	defaultColors?: Required<CardColors>;
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
	template_id: string;
	title: string;
	subtitle: string;
	flavor_text: string;
	art_url: string | null;
	colors: CardColors;
	stickers: PlacedSticker[];
}

/** Shape written by collect_card() into collections.card_snapshot. */
export interface CardSnapshot extends CardView {
	version: 1;
	card_id: string;
	owner: {
		id: string;
		username: string;
		display_name: string;
		avatar_url: string | null;
	};
}
