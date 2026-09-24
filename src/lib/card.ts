/**
 * Rows and snapshots → the `CardView` the card draws.
 *
 * These follow concard-app's `card-view.ts` (a live card) and `snapshot.ts`
 * (a collection snapshot) rule for rule, so a card reads the same on both
 * clients. Both app files import React Native through their neighbours, so
 * they are ported here by hand rather than synced; the style and link
 * normalisers they call are the synced originals.
 */

import {
	ART_DEFAULT,
	BADGE_HOME,
	BADGE_HOME_LEGACY,
	normalizeStyle,
	styleToJson,
	type CardStyle
} from '$lib/card-style';
import { snapPhotoHeight } from '$lib/app-card/layout/front';
import { normalizeLinks } from '$lib/app-card/links';
import { normalizeStickerFoil, STICKER_FOILS } from '$lib/app-card/tiers';
import { BAKED_STICKERS } from '$lib/sticker-art';
import { styleCategoryOf, type CatalogSticker } from '$lib/stickers/resolve';
import type {
	Affiliation,
	Card,
	CardSnapshot,
	CardView,
	Fandom,
	PlacedSticker,
	Profile,
	ProfileLink,
	Sticker,
	StickerFoil,
	StickerPlacement
} from '$lib/types';

/**
 * Design bible §6: 140 characters, "keep it card-sized" — enforced where a
 * bio is composed, as the app's editor does; `cards.bio` allows 200.
 */
export const BIO_MAX = 140;

/**
 * A link that is safe to render as an href: web, mail or phone. Anything else
 * (`javascript:`, `data:`) is never offered as a link, whoever wrote it.
 */
export function isLinkUrl(value: string): boolean {
	try {
		return ['https:', 'http:', 'mailto:', 'tel:'].includes(new URL(value).protocol);
	} catch {
		return false;
	}
}

/** A foil tier off a row or a snapshot, falling back to plain when missing or unrecognized. */
export const normalizeFoil = normalizeStickerFoil;

/** none -> glitter -> holo -> cosmic -> mosaic; mosaic is the ceiling. Mirrors
 *  sticker_foil_next() in 20260924000001. */
export const NEXT_FOIL = Object.fromEntries(
	STICKER_FOILS.map((f, i) => [f, STICKER_FOILS[i + 1] ?? null])
) as Record<StickerFoil, StickerFoil | null>;

export { STICKER_FOIL_LABELS as FOIL_LABEL } from '$lib/app-card/tiers';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
	v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {};
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
/** A number off a row or a snapshot, falling back when missing or unparseable. */
function num(v: unknown, fallback: number): number {
	const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
	return Number.isFinite(n) ? n : fallback;
}

export function placementToPlaced(p: StickerPlacement): PlacedSticker {
	return {
		id: p.id,
		sticker_id: p.sticker_id,
		x: Number(p.x),
		y: Number(p.y),
		rotation: Number(p.rotation),
		scale: Number(p.scale),
		z_index: p.z_index,
		foil: normalizeFoil(p.foil),
		size: p.size == null ? null : Number(p.size),
		is_affiliation: p.is_affiliation === true
	};
}

/**
 * The `style` jsonb an editor writes: the stored value with only the axes it
 * edited replaced, so keys it doesn't know (the legacy `shape`, `link_layout`)
 * survive, and in the app's own spelling (`styleToJson`, `bio_align` mirrored).
 * A blank or missing edit keeps the stored value; the photo height lands on a
 * real divider stop for this many links.
 */
export function styleForSave(
	stored: unknown,
	edits: Partial<Record<'frame' | 'bg' | 'photo_shape' | 'alignment', string>> & {
		photo_height?: number;
	},
	linkCount: number
): Record<string, unknown> {
	const base = obj(stored);
	const set = Object.fromEntries(
		Object.entries(edits).filter(([, value]) => value !== undefined && value !== '')
	) as Partial<CardStyle>;
	const next = normalizeStyle({ ...base, ...set });
	next.photo_height = snapPhotoHeight(Math.min(next.photo_height, 260), linkCount);
	return { ...base, ...styleToJson(next) };
}

/** A profile's own links (`profiles.links`, `{label, url}`), for the list under a card. */
export function readLinks(input: unknown): ProfileLink[] {
	if (!Array.isArray(input)) return [];
	return input
		.filter(
			(l): l is ProfileLink =>
				!!l && typeof l === 'object' && typeof (l as ProfileLink).url === 'string'
		)
		.map((l) => ({ label: String(l.label ?? ''), url: l.url }));
}

/**
 * The affiliation as the renderer wants it: frozen sticker art at the card's
 * position. concard-app's `affiliationFor`: a card still carrying the
 * pre-spec default spot has never been moved, so it follows the default to
 * the spec's 64 × 64 corner.
 */
export function fandomToAffiliation(
	f: Fandom | undefined | null,
	x: number | null = null,
	y: number | null = null
): Affiliation | null {
	if (!f) return null;
	const unmoved =
		x == null ||
		y == null ||
		!Number.isFinite(x) ||
		!Number.isFinite(y) ||
		(Math.abs(x - BADGE_HOME_LEGACY.x) < 0.001 && Math.abs(y - BADGE_HOME_LEGACY.y) < 0.001);
	return {
		id: f.id,
		name: f.name,
		style_category: styleCategoryOf(f),
		x: unmoved ? BADGE_HOME.x : x,
		y: unmoved ? BADGE_HOME.y : y,
		rotation: 0,
		scale: 1,
		foil: 'none'
	};
}

/** What a card reads from its owner's profile: the inherit defaults. */
export type CardOwner = Pick<Profile, 'username' | 'display_name' | 'bio' | 'pronouns'>;

/**
 * A live card as concard-app's `cardViewFrom` draws it: the card's own name,
 * pronouns and bio, each falling back to the profile's when null, and the
 * card's own links.
 */
export function cardToView(
	card: Card,
	owner: CardOwner,
	placements: StickerPlacement[],
	fandoms: Map<string, Fandom>
): CardView {
	return {
		title: card.display_name ?? owner.display_name,
		handle: owner.username,
		pronouns: card.pronouns ?? owner.pronouns ?? null,
		bio: card.bio ?? owner.bio ?? '',
		label: card.label,
		art_url: card.art_url,
		art_x: num(card.art_x, ART_DEFAULT.x),
		art_y: num(card.art_y, ART_DEFAULT.y),
		art_scale: num(card.art_scale, ART_DEFAULT.scale),
		style: normalizeStyle(card.style),
		affiliation: fandomToAffiliation(
			card.affiliation ? fandoms.get(card.affiliation) : null,
			card.affiliation_x == null ? null : Number(card.affiliation_x),
			card.affiliation_y == null ? null : Number(card.affiliation_y)
		),
		links: normalizeLinks(card.links),
		stickers: placements.map(placementToPlaced)
	};
}

/** A sticker as a snapshot (or a grant) describes it — the app's `placedFromSnapshot`. */
export function placedFromSnapshot(input: unknown, index = 0): PlacedSticker {
	const e = obj(input);
	const stickerId = str(e.sticker_id) ?? 'unknown';
	const kind =
		(str(e.kind) as 'deco' | 'fandom' | undefined) ??
		(stickerId.startsWith('fandom-') ? 'fandom' : 'deco');
	return {
		id: str(e.id) ?? `${stickerId}-${index}`,
		sticker_id: stickerId,
		x: num(e.x, 0.5),
		y: num(e.y, 0.5),
		rotation: num(e.rotation, 0),
		scale: num(e.scale, 1),
		z_index: num(e.z_index, index),
		foil: normalizeFoil(e.foil),
		size: e.size == null ? null : num(e.size, 0.24),
		is_affiliation: e.is_affiliation === true,
		kind,
		name: str(e.name),
		full_path: str(e.full_path) ?? null,
		mask_path: str(e.mask_path) ?? null,
		thumb_path: str(e.thumb_path) ?? null,
		art_aspect: e.art_aspect == null ? null : num(e.art_aspect, 1),
		fandom_id: str(e.fandom_id) ?? null,
		label: str(e.label),
		style_category:
			kind === 'fandom'
				? styleCategoryOf({
						id: str(e.fandom_id) ?? stickerId,
						name: str(e.label) ?? str(e.name) ?? stickerId,
						style_category: str(e.style_category)
					})
				: undefined
	};
}

function affiliationFromSnapshot(input: unknown): Affiliation | null {
	const a = obj(input);
	const id = str(a.id);
	const name = str(a.name);
	if (!id || !name) return null;
	return {
		id,
		name,
		style_category: styleCategoryOf({ id, name, style_category: str(a.style_category) }),
		x: num(a.x, 0.8),
		y: num(a.y, 0.86),
		rotation: 0,
		scale: 1,
		foil: 'none'
	};
}

/**
 * Read a frozen snapshot back out of collections.card_snapshot, by
 * concard-app's `snapshotToView` rules (v2–v4). Version 1 rows (the
 * magic-card era) keep their web-only mapping: flavour text as the bio, the
 * default look, no affiliation or links, so an old binder never changes
 * appearance twice.
 */
export function snapshotToView(snapshot: unknown): CardSnapshot {
	const s = obj(snapshot);
	const owner = obj(s.owner);
	const version = num(s.version, 1);
	const v1 = version < 2;
	const stickers = Array.isArray(s.stickers)
		? s.stickers.map((e, i) => placedFromSnapshot(e, i))
		: [];
	return {
		version,
		card_id: String(s.card_id ?? ''),
		title: String(s.title ?? owner.display_name ?? owner.username ?? 'Someone'),
		handle: String(owner.username ?? ''),
		pronouns: str(s.pronouns) ?? null,
		bio: String((v1 ? s.flavor_text : s.bio) ?? ''),
		label: null,
		art_url: str(s.art_url) ?? null,
		art_x: num(s.art_x, ART_DEFAULT.x),
		art_y: num(s.art_y, ART_DEFAULT.y),
		art_scale: num(s.art_scale, ART_DEFAULT.scale),
		style: normalizeStyle(v1 ? {} : s.style),
		// v4 carries the affiliation as a placement too; the card draws that one.
		affiliation: v1 ? null : affiliationFromSnapshot(s.affiliation),
		links: v1 ? [] : normalizeLinks(s.links),
		stickers,
		owner: {
			id: String(owner.id ?? ''),
			username: String(owner.username ?? ''),
			display_name: String(owner.display_name ?? owner.username ?? 'Someone'),
			avatar_url: str(owner.avatar_url) ?? null
		}
	};
}

/** A sticker's baked die-cut artwork, or null when it has none. */
export interface BakedArt {
	/** Artwork with the rim and shadows already drawn in. */
	src: string;
	/** The artwork's alpha alone, for masking the foil to its silhouette. */
	mask: string;
}

/**
 * Where to find a sticker's baked artwork (the web's older bakes, for
 * stickers the ingest hasn't produced art for yet).
 *
 * An admin upload wins over the bake: `image_url` is custom art somebody chose
 * for this sticker, while the bake is only ever derived from its emoji, so a
 * sticker that has both should show the upload. Stickers with neither fall back
 * to drawing the glyph live with the CSS rim.
 */
export function bakedArt(sticker: Sticker | undefined): BakedArt | null {
	if (!sticker || sticker.image_url || !BAKED_STICKERS.has(sticker.id)) return null;
	return { src: `/stickers/${sticker.id}.webp`, mask: `/stickers/${sticker.id}.mask.webp` };
}

export type StickerCatalog = Map<string, CatalogSticker>;

/** Catalog rows by id; a fandom sticker picks up its fandom's style category. */
export function catalogFrom(stickers: Sticker[], fandoms: Fandom[] = []): StickerCatalog {
	const styles = new Map(fandoms.map((f) => [f.id, f.style_category]));
	return new Map(
		stickers.map((s) => [
			s.id,
			{ ...s, style_category: s.fandom_id ? (styles.get(s.fandom_id) ?? null) : null }
		])
	);
}

export function fandomMap(fandoms: Fandom[]): Map<string, Fandom> {
	return new Map(fandoms.map((f) => [f.id, f]));
}

export const RARITY_LABEL: Record<Sticker['rarity'], string> = {
	common: 'Common',
	uncommon: 'Uncommon',
	rare: 'Rare',
	legendary: 'Legendary'
};

/**
 * How many times you've met this card's owner → the card's tier foil in your
 * binder (design bible §7, concard-app's `tiers.ts`): one collection per
 * meeting, as the app counts them.
 */
export function meetingsByOwner(collections: { owner_id: string }[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const c of collections) counts.set(c.owner_id, (counts.get(c.owner_id) ?? 0) + 1);
	return counts;
}
