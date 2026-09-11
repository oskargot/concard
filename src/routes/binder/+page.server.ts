import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const supabase = locals.supabase;
	const uid = locals.user!.id;

	const [collections, templates, stickers] = await Promise.all([
		supabase
			.from('collections')
			.select('*')
			.eq('collector_id', uid)
			.order('collected_at', { ascending: false }),
		supabase.from('card_templates').select('*'),
		supabase.from('stickers').select('*')
	]);

	return {
		collections: collections.data ?? [],
		templates: templates.data ?? [],
		stickers: stickers.data ?? []
	};
};
