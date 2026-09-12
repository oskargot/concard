import { ART_DEFAULT, BADGE_HOME, normalizeStyle } from '$lib/card-style';
import type {
	Affiliation,
	Card,
	CardSnapshot,
	CardView,
	Fandom,
	PlacedSticker,
	ProfileLink,
	Sticker,
	StickerFoil,
	StickerPlacement
} from '$lib/types';

const FOILS: StickerFoil[] = ['none', 'glitter', 'holo'];
const isFoil = (v: unknown): v is StickerFoil => FOILS.includes(v as StickerFoil);

/** none -> glitter -> holo; holo is the ceiling, nothing combines past it. */
export const NEXT_FOIL: Record<StickerFoil, StickerFoil | null> = {
	none: 'glitter',
	glitter: 'holo',
	holo: null
};

export const FOIL_LABEL: Record<StickerFoil, string> = {
	none: 'Plain',
	glitter: 'Glitter',
	holo: 'Holo'
};

export function placementToPlaced(p: StickerPlacement): PlacedSticker {
	return {
		id: p.id,
		sticker_id: p.sticker_id,
		x: Number(p.x),
		y: Number(p.y),
		rotation: Number(p.rotation),
		scale: Number(p.scale),
		z_index: p.z_index,
		foil: isFoil(p.foil) ? p.foil : 'none'
	};
}

export function readLinks(input: unknown): ProfileLink[] {
	if (!Array.isArray(input)) return [];
	return input
		.filter(
			(l): l is ProfileLink =>
				!!l && typeof l === 'object' && typeof (l as ProfileLink).url === 'string'
		)
		.map((l) => ({ label: String(l.label ?? ''), url: l.url }));
}

export function fandomToAffiliation(
	f: Fandom | undefined | null,
	x: number = BADGE_HOME.x,
	y: number = BADGE_HOME.y
): Affiliation | null {
	if (!f) return null;
	return {
		id: f.id,
		name: f.name,
		mark: f.mark,
		color_a: f.color_a,
		color_b: f.color_b,
		x: Number.isFinite(x) ? x : BADGE_HOME.x,
		y: Number.isFinite(y) ? y : BADGE_HOME.y
	};
}

/** What a card reads from its owner's profile. */
export interface CardOwner {
	username: string;
	display_name: string;
	bio: string;
	links: unknown;
}

/** A number off a row or a snapshot, falling back when missing or unparseable. */
function readNum(v: unknown, fallback: number): number {
	const n = Number(v);
	return Number.isFinite(n) ? n : fallback;
}

/** Build the renderable view of a live card from its database rows. */
export function cardToView(
	card: Card,
	owner: CardOwner,
	placements: StickerPlacement[],
	fandoms: Map<string, Fandom>
): CardView {
	return {
		title: owner.display_name,
		handle: owner.username,
		bio: owner.bio,
		art_url: card.art_url,
		art_x: readNum(card.art_x, ART_DEFAULT.x),
		art_y: readNum(card.art_y, ART_DEFAULT.y),
		art_scale: readNum(card.art_scale, ART_DEFAULT.scale),
		style: normalizeStyle(card.style),
		affiliation: fandomToAffiliation(
			card.affiliation ? fandoms.get(card.affiliation) : null,
			Number(card.affiliation_x),
			Number(card.affiliation_y)
		),
		links: readLinks(owner.links),
		stickers: placements.map(placementToPlaced)
	};
}

function readAffiliation(input: unknown): Affiliation | null {
	if (!input || typeof input !== 'object') return null;
	const a = input as Partial<Affiliation>;
	if (!a.id || !a.mark) return null;
	// Snapshots taken before the badge could be moved carry no position; they
	// were drawn in the footer, which is exactly where BADGE_HOME puts it.
	const x = Number(a.x);
	const y = Number(a.y);
	return {
		id: String(a.id),
		name: String(a.name ?? a.id),
		mark: String(a.mark),
		color_a: String(a.color_a ?? '#b4b8c4'),
		color_b: String(a.color_b ?? '#8f96a5'),
		x: Number.isFinite(x) ? x : BADGE_HOME.x,
		y: Number.isFinite(y) ? y : BADGE_HOME.y
	};
}

/**
 * Read a frozen snapshot back out of collections.card_snapshot.
 * Version 1 rows (the magic-card era) map forward to silver / paper / rounded so
 * existing binders keep working and never change appearance twice.
 */
export function snapshotToView(snapshot: unknown): CardSnapshot {
	const s = (snapshot ?? {}) as Record<string, unknown>;
	const version = Number(s.version ?? 1);
	const owner = (s.owner ?? {}) as Partial<CardSnapshot['owner']>;
	const rawStickers = Array.isArray(s.stickers) ? (s.stickers as Partial<PlacedSticker>[]) : [];

	const v1 = version < 2;
	return {
		version: 2,
		card_id: String(s.card_id ?? ''),
		title: String(s.title ?? 'Untitled'),
		handle: String(owner.username ?? ''),
		bio: String((v1 ? s.flavor_text : s.bio) ?? ''),
		art_url: typeof s.art_url === 'string' ? s.art_url : null,
		art_x: readNum(s.art_x, ART_DEFAULT.x),
		art_y: readNum(s.art_y, ART_DEFAULT.y),
		art_scale: readNum(s.art_scale, ART_DEFAULT.scale),
		style: v1 ? normalizeStyle({}) : normalizeStyle(s.style),
		affiliation: v1 ? null : readAffiliation(s.affiliation),
		links: v1 ? [] : readLinks(s.links),
		stickers: rawStickers.map((p) => ({
			id: undefined,
			sticker_id: String(p.sticker_id),
			x: Number(p.x),
			y: Number(p.y),
			rotation: Number(p.rotation ?? 0),
			scale: Number(p.scale ?? 1),
			z_index: Number(p.z_index ?? 0),
			foil: isFoil(p.foil) ? p.foil : 'none'
		})),
		owner: {
			id: String(owner.id ?? ''),
			username: String(owner.username ?? ''),
			display_name: String(owner.display_name ?? owner.username ?? 'Someone'),
			avatar_url: owner.avatar_url ?? null
		}
	};
}

export type StickerCatalog = Map<string, Sticker>;

export function catalogFrom(stickers: Sticker[]): StickerCatalog {
	return new Map(stickers.map((s) => [s.id, s]));
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
