/**
 * The fandom sticker types the renderer copied from concard-app expects
 * (concard-app/src/stickers/types.ts, minus the parts that need React Native).
 */

export const FANDOM_STYLE_CATEGORIES = [
	'retro-sci-fi',
	'cute',
	'fantasy',
	'action',
	'horror',
	'tech',
	'general'
] as const;

export type FandomStyleCategory = (typeof FANDOM_STYLE_CATEGORIES)[number];

export type FandomCase = 'upper' | 'lower' | 'title' | 'preserve';

export interface FandomStickerDefinition {
	id: string;
	name: string;
	kind: 'fandom';
	label: string;
	styleCategory: FandomStyleCategory;
}
