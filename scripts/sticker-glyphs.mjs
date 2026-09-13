// The emoji-backed stickers in the catalog, and the Noto artwork each one bakes
// from. Mirrors the seed block in
// supabase/migrations/20260911000000_init.sql — if you seed a new emoji sticker
// there, add it here too and re-run `pnpm stickers`, or it falls back to the
// live-glyph path (correct, just slower and rendered in the viewer's own emoji
// font rather than everyone's).
//
// Image-backed stickers (admin uploads, `stickers.image_url` pointing at the
// sticker-art bucket) are not listed here: they have no glyph to bake from and
// still get the CSS rim.
export const STICKER_GLYPHS = [
	{ id: 'star', glyph: '⭐' },
	{ id: 'heart', glyph: '❤️' },
	{ id: 'sparkles', glyph: '✨' },
	{ id: 'fire', glyph: '🔥' },
	{ id: 'cat', glyph: '🐱' },
	{ id: 'rocket', glyph: '🚀' },
	{ id: 'sushi', glyph: '🍣' },
	{ id: 'dice', glyph: '🎲' },
	{ id: 'crown', glyph: '👑' },
	{ id: 'dragon', glyph: '🐉' },
	{ id: 'ufo', glyph: '🛸' },
	{ id: 'rainbow', glyph: '🌈' }
];

/**
 * Noto's filename for a glyph: every codepoint in lowercase hex, joined with
 * `_`. U+FE0F (the "render this as emoji" variation selector) is not part of
 * the artwork and is dropped — `❤️` is U+2764 U+FE0F but the file is
 * `emoji_u2764.svg`.
 */
export function notoFileName(glyph) {
	const cps = [...glyph]
		.map((c) => c.codePointAt(0))
		.filter((cp) => cp !== 0xfe0f)
		.map((cp) => cp.toString(16));
	return `emoji_u${cps.join('_')}.svg`;
}
