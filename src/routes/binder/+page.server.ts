import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const supabase = locals.supabase;
	const uid = locals.user!.id;

	const [collections, stickers] = await Promise.all([
		supabase
			.from('collections')
			.select('*')
			.eq('collector_id', uid)
			.order('collected_at', { ascending: false }),
		supabase.from('stickers').select('*')
	]);

	return {
		collections: collections.data ?? [],
		stickers: stickers.data ?? []
	};
};
