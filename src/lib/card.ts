import { normalizeStyle } from '$lib/card-style';
import type {
	Affiliation,
	Card,
	CardSnapshot,
	CardView,
	Fandom,
	PlacedSticker,
	ProfileLink,
	Sticker,
	StickerPlacement
} from '$lib/types';

export function placementToPlaced(p: StickerPlacement): PlacedSticker {
	return {
		id: p.id,
		sticker_id: p.sticker_id,
		x: Number(p.x),
		y: Number(p.y),
		rotation: Number(p.rotation),
		scale: Number(p.scale),
		z_index: p.z_index
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

export function fandomToAffiliation(f: Fandom | undefined | null): Affiliation | null {
	if (!f) return null;
	return { id: f.id, name: f.name, mark: f.mark, color_a: f.color_a, color_b: f.color_b };
}

/** Build the renderable view of a live card from its database rows. */
export function cardToView(
	card: Card,
	owner: { username: string; links: unknown },
	placements: StickerPlacement[],
	fandoms: Map<string, Fandom>
): CardView {
	return {
		title: card.title,
		handle: owner.username,
		bio: card.bio,
		art_url: card.art_url,
		style: normalizeStyle(card.style),
		affiliation: fandomToAffiliation(card.affiliation ? fandoms.get(card.affiliation) : null),
		links: readLinks(owner.links),
		stickers: placements.map(placementToPlaced)
	};
}

function readAffiliation(input: unknown): Affiliation | null {
	if (!input || typeof input !== 'object') return null;
	const a = input as Partial<Affiliation>;
	if (!a.id || !a.mark) return null;
	return {
		id: String(a.id),
		name: String(a.name ?? a.id),
		mark: String(a.mark),
		color_a: String(a.color_a ?? '#b4b8c4'),
		color_b: String(a.color_b ?? '#8f96a5')
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
			z_index: Number(p.z_index ?? 0)
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
