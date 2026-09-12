import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const supabase = locals.supabase;
	const uid = locals.user!.id;

	const { data: collection } = await supabase
		.from('collections')
		.select('*')
		.eq('id', params.id)
		.eq('collector_id', uid)
		.maybeSingle();
	if (!collection) error(404, 'Not in your binder');

	const [owner, stickers, mutual] = await Promise.all([
		supabase
			.from('profiles')
			.select('username, display_name')
			.eq('id', collection.owner_id)
			.maybeSingle(),
		supabase.from('stickers').select('*'),
		supabase
			.from('collections')
			.select('id', { count: 'exact', head: true })
			.eq('collector_id', collection.owner_id)
			.eq('owner_id', uid)
	]);

	return {
		collection,
		owner: owner.data,
		stickers: stickers.data ?? [],
		mutual: (mutual.count ?? 0) > 0
	};
};

export const actions: Actions = {
	discard: async ({ locals, params }) => {
		await locals.supabase
			.from('collections')
			.delete()
			.eq('id', params.id)
			.eq('collector_id', locals.user!.id);
		redirect(303, '/binder');
	}
};
