/**
 * What a placed sticker looks like, on the web card.
 *
 * Mirrors concard-app's src/stickers/definitions.ts: a placement (or a v4
 * snapshot's copy of one) may carry its own definition — kind, the ingest's
 * baked asset paths, a fandom's label and style — and otherwise the catalog
 * row supplies it. Deco art comes from the ingest's immutable objects in the
 * public `stickers` bucket; a sticker without them falls back to the web's
 * older baked art / glyph path in Card.svelte.
 *
 * Sizes follow the app exactly: a placement's `size` is its base size as a
 * fraction of the card's width — a deco sticker's long edge, a fandom
 * sticker's width — times `scale`; placements from before `size` existed use
 * the old 15.33% box, the free affiliation 64/250.
 */

import { env } from '$env/dynamic/public';
import type { PlacedSticker, Sticker } from '$lib/types';
import { styleCategoryForFandom } from './fandom-styles';
import { FANDOM_STYLE_CATEGORIES, type FandomStyleCategory } from './types';

export const LEGACY_STICKER_WIDTH = 0.1533;
export const AFFILIATION_STICKER_WIDTH = 64 / 250;
/** What a newly placed sticker stores as `size`, as the app writes it. */
export const STICKER_BASE_WIDTH = 0.24;
/** max_stickers_per_card(); the free affiliation doesn't count. */
export const MAX_STICKERS_PER_CARD = 20;

/** A catalog row, plus the style category of the fandom it came from. */
export type CatalogSticker = Sticker & { style_category?: string | null };

export type StickerLook =
	| { kind: 'deco'; name: string; full: string; mask: string; aspect: number }
	| { kind: 'fandom'; name: string; label: string; styleCategory: FandomStyleCategory }
	| { kind: 'legacy' };

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

export function lookFor(p: PlacedSticker, row: CatalogSticker | undefined): StickerLook {
	const kind = p.kind ?? row?.kind ?? (p.sticker_id.startsWith('fandom-') ? 'fandom' : 'deco');
	if (kind === 'fandom') {
		const label = p.label ?? row?.name ?? p.sticker_id.replace(/^fandom-/, '');
		const style = p.style_category ?? row?.style_category;
		return {
			kind: 'fandom',
			name: label,
			label,
			styleCategory: isStyle(style)
				? style
				: styleCategoryForFandom({ id: p.fandom_id ?? row?.fandom_id ?? p.sticker_id, name: label })
		};
	}
	const full = p.full_path ?? row?.full_path;
	const mask = p.mask_path ?? row?.mask_path;
	if (!full || !mask) return { kind: 'legacy' };
	return {
		kind: 'deco',
		name: p.name ?? row?.name ?? p.sticker_id,
		full: stickerAssetUrl(full),
		mask: stickerAssetUrl(mask),
		aspect: Number(p.art_aspect ?? row?.art_aspect) || 1
	};
}

/** Base size (fraction of card width) for any era of placement. */
export function baseSizeOf(p: PlacedSticker): number {
	if (p.size != null) return Number(p.size);
	return p.is_affiliation ? AFFILIATION_STICKER_WIDTH : LEGACY_STICKER_WIDTH;
}
