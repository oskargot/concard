/**
 * What a placed sticker looks like, on the web card.
 *
 * Mirrors concard-app's src/stickers/definitions.ts: a placement (or a v4
 * snapshot's copy of one) may carry its own definition — kind, the ingest's
 * baked asset paths, a fandom's label and style — and otherwise the catalog
 * row supplies it. Deco art comes from the ingest's immutable objects in the
 * public `stickers` bucket; a sticker without them falls back to the web's
 * older baked art / glyph path (`legacy`).
 *
 * Sizes follow the app exactly (`constants.ts`, synced verbatim): a
 * placement's `size` is its base size as a fraction of the card's width — a
 * deco sticker's long edge, a fandom sticker's width — times `scale`;
 * placements from before `size` existed use the old 15.33% box, the free
 * affiliation 64/250.
 */

import { env } from '$env/dynamic/public';
import type { PlacedSticker, Sticker } from '$lib/types';
import { styleCategoryForFandom } from './fandom-styles';
import { FANDOM_STYLE_CATEGORIES, type FandomStyleCategory } from './types';

export {
	AFFILIATION_STICKER_WIDTH,
	baseSizeOf,
	LEGACY_STICKER_WIDTH,
	MAX_STICKERS_PER_CARD,
	STICKER_BASE_WIDTH
} from './constants';

/** A catalog row, plus the style category of the fandom it came from. */
export type CatalogSticker = Sticker & { style_category?: string | null };

export type StickerLook =
	| {
			kind: 'deco';
			name: string;
			full: string;
			mask: string;
			/** The 192 px thumbnail, when the sticker has one. */
			thumb: string | null;
			aspect: number;
	  }
	| { kind: 'fandom'; name: string; label: string; styleCategory: FandomStyleCategory }
	| { kind: 'legacy' };

/** Long edge of the ingest's baked thumbnail, px (scripts/stickers/pipeline.ts THUMB_EDGE). */
export const THUMB_EDGE_PX = 192;

/** Public URL of an object in the `stickers` bucket. `PUBLIC_STICKER_ASSET_BASE`
 *  overrides the base (the dev gallery serves the app's fixture bakes). */
export function stickerAssetUrl(path: string): string {
	const base =
		env.PUBLIC_STICKER_ASSET_BASE ??
		`${(env.PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')}/storage/v1/object/public/stickers/`;
	return `${base.replace(/\/*$/, '/')}${path}`;
}

function isStyle(v: unknown): v is FandomStyleCategory {
	return FANDOM_STYLE_CATEGORIES.includes(v as FandomStyleCategory);
}

/** The fandom's own style category if it has one, else the renderer's guess
 *  (concard-app's `styleCategoryOf`). */
export function styleCategoryOf(fandom: {
	id: string;
	name: string;
	style_category?: string | null;
}): FandomStyleCategory {
	return isStyle(fandom.style_category) ? fandom.style_category : styleCategoryForFandom(fandom);
}

export function lookFor(p: PlacedSticker, row: CatalogSticker | undefined): StickerLook {
	const kind = p.kind ?? row?.kind ?? (p.sticker_id.startsWith('fandom-') ? 'fandom' : 'deco');
	if (kind === 'fandom') {
		const label = p.label ?? row?.name ?? p.sticker_id.replace(/^fandom-/, '');
		return {
			kind: 'fandom',
			name: label,
			label,
			styleCategory: styleCategoryOf({
				id: p.fandom_id ?? row?.fandom_id ?? p.sticker_id,
				name: label,
				style_category: p.style_category ?? row?.style_category
			})
		};
	}
	const full = p.full_path ?? row?.full_path;
	const mask = p.mask_path ?? row?.mask_path;
	if (!full || !mask) return { kind: 'legacy' };
	const thumb = p.thumb_path ?? row?.thumb_path;
	return {
		kind: 'deco',
		name: p.name ?? row?.name ?? p.sticker_id,
		full: stickerAssetUrl(full),
		mask: stickerAssetUrl(mask),
		thumb: thumb ? stickerAssetUrl(thumb) : null,
		aspect: Number(p.art_aspect ?? row?.art_aspect) || 1
	};
}

/** The box a deco sticker of base size `size` (its long edge) occupies — the app's `decoBox`. */
export function decoBox(aspect: number, size: number): { width: number; height: number } {
	return aspect >= 1
		? { width: size, height: size / aspect }
		: { width: size * aspect, height: size };
}

/**
 * Which deco art to draw at `size` px: anything the thumbnail covers draws the
 * thumbnail, as the app's DecoSticker chooses, so small stickers never decode
 * the full 592 px art.
 */
export function decoArt(look: Extract<StickerLook, { kind: 'deco' }>, size: number, dpr: number) {
	return look.thumb && size * dpr <= THUMB_EDGE_PX ? look.thumb : look.full;
}
