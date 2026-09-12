import { normalizeFoil } from '$lib/card';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const supabase = locals.supabase;
	const uid = locals.user!.id;

	const [stickers, inventory, myCards] = await Promise.all([
		supabase.from('stickers').select('*').order('sort_order'),
		supabase.from('sticker_inventory').select('*').eq('owner_id', uid),
		supabase.from('cards').select('id').eq('owner_id', uid)
	]);

	// A copy currently decorating a card can't be combined away out from
	// under it — combine_stickers() enforces this server-side too, but the
	// grid needs to know which copies are spare to disable the rest.
	const myCardIds = (myCards.data ?? []).map((c) => c.id);
	const placed = myCardIds.length
		? ((
				await supabase
					.from('sticker_placements')
					.select('sticker_id, foil')
					.in('card_id', myCardIds)
			).data ?? [])
		: [];
	const placedCount: Record<string, number> = {};
	for (const p of placed) {
		const key = `${p.sticker_id}:${normalizeFoil(p.foil)}`;
		placedCount[key] = (placedCount[key] ?? 0) + 1;
	}

	return {
		stickers: stickers.data ?? [],
		inventory: inventory.data ?? [],
		placedCount
	};
};
