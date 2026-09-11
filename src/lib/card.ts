import type {
	Card,
	CardColors,
	CardSnapshot,
	CardTemplate,
	CardView,
	PlacedSticker,
	Sticker,
	StickerPlacement,
	TemplateConfig
} from '$lib/types';

const DEFAULT_COLORS: Required<CardColors> = {
	primary: '#1f2937',
	secondary: '#f8fafc',
	accent: '#f59e0b'
};

export function templateConfig(template: CardTemplate | undefined): TemplateConfig {
	const cfg = (template?.config ?? {}) as TemplateConfig;
	return {
		frame: cfg.frame ?? 'solid',
		font: cfg.font ?? 'sans',
		defaultColors: { ...DEFAULT_COLORS, ...(cfg.defaultColors ?? {}) }
	};
}

/** Card colours with template defaults filled in for anything the user left unset. */
export function resolveColors(
	colors: CardColors | null | undefined,
	template: CardTemplate | undefined
): Required<CardColors> {
	return { ...templateConfig(template).defaultColors!, ...(colors ?? {}) };
}

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

/** Build the renderable view of a live card from its database rows. */
export function cardToView(card: Card, placements: StickerPlacement[]): CardView {
	return {
		template_id: card.template_id,
		title: card.title,
		subtitle: card.subtitle,
		flavor_text: card.flavor_text,
		art_url: card.art_url,
		colors: (card.colors ?? {}) as CardColors,
		stickers: placements.map(placementToPlaced)
	};
}

/** Read a frozen snapshot back out of collections.card_snapshot. */
export function snapshotToView(snapshot: unknown): CardSnapshot {
	const s = (snapshot ?? {}) as Partial<CardSnapshot> & { stickers?: unknown[] };
	const stickers = Array.isArray(s.stickers) ? (s.stickers as PlacedSticker[]) : [];
	return {
		version: 1,
		card_id: s.card_id ?? '',
		template_id: s.template_id ?? 'classic',
		title: s.title ?? 'Untitled',
		subtitle: s.subtitle ?? '',
		flavor_text: s.flavor_text ?? '',
		art_url: s.art_url ?? null,
		colors: s.colors ?? {},
		stickers: stickers.map((p) => ({
			id: undefined,
			sticker_id: String(p.sticker_id),
			x: Number(p.x),
			y: Number(p.y),
			rotation: Number(p.rotation ?? 0),
			scale: Number(p.scale ?? 1),
			z_index: Number(p.z_index ?? 0)
		})),
		owner: {
			id: s.owner?.id ?? '',
			username: s.owner?.username ?? '',
			display_name: s.owner?.display_name ?? s.owner?.username ?? 'Someone',
			avatar_url: s.owner?.avatar_url ?? null
		}
	};
}

export type StickerCatalog = Map<string, Sticker>;

export function catalogFrom(stickers: Sticker[]): StickerCatalog {
	return new Map(stickers.map((s) => [s.id, s]));
}

export const RARITY_LABEL: Record<Sticker['rarity'], string> = {
	common: 'Common',
	uncommon: 'Uncommon',
	rare: 'Rare',
	legendary: 'Legendary'
};
