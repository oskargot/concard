import { fail, redirect } from '@sveltejs/kit';
import { randomStyle } from '$lib/card-style';
import type { Json } from '$lib/supabase/types';
import { qrSvg } from '$lib/server/qr';
import { siteOrigin } from '$lib/supabase/env';
import { profileUrl } from '$lib/username';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const profile = locals.profile!;
	const supabase = locals.supabase;

	const [cards, fandoms, stickers, collected, collectors] = await Promise.all([
		supabase.from('cards').select('*').eq('owner_id', profile.id).order('created_at'),
		supabase.from('fandoms').select('*').eq('is_active', true).order('sort_order'),
		supabase.from('stickers').select('*').order('sort_order'),
		supabase
			.from('collections')
			.select('id', { count: 'exact', head: true })
			.eq('collector_id', profile.id),
		supabase
			.from('collections')
			.select('id', { count: 'exact', head: true })
			.eq('owner_id', profile.id)
	]);

	const placements = profile.active_card_id
		? ((await supabase.from('sticker_placements').select('*').eq('card_id', profile.active_card_id))
				.data ?? [])
		: [];

	const link = profileUrl(siteOrigin(url.origin), profile.username);

	return {
		profile,
		cards: cards.data ?? [],
		fandoms: fandoms.data ?? [],
		stickers: stickers.data ?? [],
		placements,
		link,
		qr: await qrSvg(link),
		stats: { collected: collected.count ?? 0, collectors: collectors.count ?? 0 }
	};
};

export const actions: Actions = {
	setActive: async ({ request, locals }) => {
		const form = await request.formData();
		const cardId = String(form.get('card_id') ?? '');
		const { error } = await locals.supabase
			.from('profiles')
			.update({ active_card_id: cardId })
			.eq('id', locals.user!.id);
		if (error) return fail(400, { error: error.hint ?? error.message });
		return { ok: true };
	},

	newCard: async ({ locals }) => {
		const profile = locals.profile!;
		const { data, error } = await locals.supabase
			.from('cards')
			.insert({ owner_id: profile.id, style: randomStyle() as unknown as Json })
			.select('id')
			.single();
		if (error || !data)
			return fail(400, { error: error?.hint ?? error?.message ?? 'Could not create card' });
		redirect(303, `/me/cards/${data.id}`);
	}
};
