/**
 * A fixture card with nothing behind it, for places that need to show what a
 * card looks like before the viewer has one: the signed-out home page and the
 * /dev/cards gallery.
 */
import { ART_DEFAULT, BADGE_HOME, DEFAULT_STYLE } from '$lib/card-style';
import { FIXTURE_STICKERS } from '$lib/stickers/fixtures';
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
		is_active: true,
		kind: 'deco',
		full_path: null,
		mask_path: null,
		thumb_path: null,
		art_aspect: null,
		fandom_id: null
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
		is_active: true,
		kind: 'deco',
		full_path: null,
		mask_path: null,
		thumb_path: null,
		art_aspect: null,
		fandom_id: null
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
		is_active: true,
		kind: 'deco',
		full_path: null,
		mask_path: null,
		thumb_path: null,
		art_aspect: null,
		fandom_id: null
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
		is_active: true,
		kind: 'deco',
		full_path: null,
		mask_path: null,
		thumb_path: null,
		art_aspect: null,
		fandom_id: null
	}
];

export const demoCatalog = (): Map<string, Sticker> => new Map(DEMO_STICKERS.map((s) => [s.id, s]));

/**
 * The card on the home page and in the dev gallery — concard-app's
 * `DEMO_CARD` (src/card/demo-card.ts), so the two can be compared card for
 * card. Gold on butter, arch photo, four links, stickers and the Anime
 * affiliation.
 */
export const DEMO_CARD: CardView = {
	title: 'Oskar',
	handle: 'oskar',
	pronouns: null,
	bio: 'Anime and sci-fi con regular. Making concard. Will trade stickers for good tea recommendations.',
	label: null,
	art_url: null,
	art_x: ART_DEFAULT.x,
	art_y: ART_DEFAULT.y,
	art_scale: ART_DEFAULT.scale,
	style: { ...DEFAULT_STYLE, frame: 'gold', bg: 'butter', photo_shape: 'arch', photo_height: 126 },
	affiliation: {
		id: 'anime',
		name: 'Anime',
		style_category: 'cute',
		...BADGE_HOME,
		rotation: 0,
		scale: 1,
		foil: 'none'
	},
	links: [
		{ url: 'https://bsky.app/profile/oskar.bsky.social', handle: '@oskar.bsky.social' },
		{ url: 'https://oskar.itch.io', handle: 'oskar' },
		{ url: 'https://instagram.com/pixelpastrycafe', handle: '@pixelpastrycafe' },
		{ url: 'https://oskargot.space', handle: 'oskargot.space' }
	],
	stickers: [
		{ sticker_id: 'star', x: 0.87, y: 0.14, rotation: 0, scale: 0.9, z_index: 1, foil: 'none' },
		{
			sticker_id: 'dragon',
			x: 0.13,
			y: 0.33,
			rotation: 0,
			scale: 0.95,
			z_index: 2,
			foil: 'glitter'
		},
		{ sticker_id: 'rainbow', x: 0.94, y: 0.82, rotation: 0, scale: 0.85, z_index: 3, foil: 'holo' }
	]
};

/** concard-app's `DEMO_CARD_ALT`: a second fixture, so comparisons aren't two identical cards. */
export const DEMO_CARD_ALT: CardView = {
	...DEMO_CARD,
	title: 'Rafa Lindqvist',
	handle: 'rafadraws',
	pronouns: 'they/them',
	bio: 'Inks comics too slowly. Table H14 all weekend.',
	label: 'Business',
	style: { ...DEFAULT_STYLE, frame: 'gold', bg: 'slate', photo_shape: 'circle' },
	affiliation: null,
	stickers: [
		{ sticker_id: 'cat', x: 0.18, y: 0.22, rotation: -6, scale: 1, z_index: 1, foil: 'none' }
	],
	links: [
		{ url: 'https://rafadraws.tumblr.com', handle: 'rafadraws' },
		{ url: 'https://ko-fi.com/rafadraws', handle: 'rafadraws' }
	]
};

/**
 * The app's bundled fixture stickers as catalog rows, for dev pages: the same
 * bakes the app draws its demo cards with (served from static/sticker-fixtures/
 * when PUBLIC_STICKER_ASSET_BASE points there).
 */
export function fixtureCatalog(): Map<string, Sticker> {
	return new Map(
		FIXTURE_STICKERS.map((f) => [
			f.id,
			{
				id: f.id,
				name: f.name,
				glyph: null,
				image_url: null,
				rarity: 'common',
				source: 'starter',
				price_cents: null,
				sort_order: f.sort_order,
				is_active: true,
				kind: 'deco',
				full_path: f.full_path,
				mask_path: f.mask_path,
				thumb_path: f.thumb_path,
				art_aspect: f.art_aspect,
				fandom_id: null
			} satisfies Sticker
		])
	);
}
