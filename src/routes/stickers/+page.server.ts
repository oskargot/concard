import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const supabase = locals.supabase;
	const uid = locals.user!.id;

	const [stickers, inventory] = await Promise.all([
		supabase.from('stickers').select('*').order('sort_order'),
		supabase.from('sticker_inventory').select('*').eq('owner_id', uid)
	]);

	return {
		stickers: stickers.data ?? [],
		inventory: inventory.data ?? []
	};
};
