/**
 * A fixture card with nothing behind it, for places that need to show what a
 * card looks like before the viewer has one: the signed-out home page and the
 * /dev/cards gallery.
 */
import { BADGE_HOME } from '$lib/card-style';
import type { CardView, Sticker } from '$lib/types';

export const DEMO_STICKERS: Sticker[] = [
	{
		id: 'star',
		name: 'Star',
		glyph: '⭐',
		image_url: null,
		rarity: 'common',
		source: 'starter',
		price_cents: null,
		sort_order: 1,
		is_active: true
	},
	{
		id: 'cat',
		name: 'Cat',
		glyph: '🐱',
		image_url: null,
		rarity: 'uncommon',
		source: 'drop',
		price_cents: null,
		sort_order: 2,
		is_active: true
	},
	{
		id: 'dragon',
		name: 'Dragon',
		glyph: '🐉',
		image_url: null,
		rarity: 'rare',
		source: 'drop',
		price_cents: null,
		sort_order: 3,
		is_active: true
	},
	{
		id: 'rainbow',
		name: 'Rainbow',
		glyph: '🌈',
		image_url: null,
		rarity: 'legendary',
		source: 'drop',
		price_cents: null,
		sort_order: 4,
		is_active: true
	}
];

export const demoCatalog = (): Map<string, Sticker> => new Map(DEMO_STICKERS.map((s) => [s.id, s]));

/** The card on the home page. Gold on butter, so it reads warm next to the chrome. */
export const DEMO_CARD: CardView = {
	title: 'Oskar',
	handle: 'oskar',
	bio: 'Anime and sci-fi con regular. Making concard. Will trade stickers for good tea recommendations.',
	art_url: null,
	style: { frame: 'gold', bg: 'butter', shape: 'rounded', photo_shape: 'arch' },
	affiliation: {
		id: 'anime',
		name: 'Anime',
		mark: 'ANI',
		color_a: '#ff7eb6',
		color_b: '#7c4dff',
		...BADGE_HOME
	},
	links: [
		{ label: 'bsky', url: 'https://bsky.app/profile/oskar' },
		{ label: 'itch.io', url: 'https://oskar.itch.io' }
	],
	stickers: [
		{ sticker_id: 'star', x: 0.87, y: 0.14, rotation: 0, scale: 0.9, z_index: 1 },
		{ sticker_id: 'dragon', x: 0.13, y: 0.33, rotation: 0, scale: 0.95, z_index: 2 },
		{ sticker_id: 'rainbow', x: 0.94, y: 0.82, rotation: 0, scale: 0.85, z_index: 3 }
	]
};
