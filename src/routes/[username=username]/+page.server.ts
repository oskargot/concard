import { error, fail } from '@sveltejs/kit';
import { COLLECT_COOLDOWN_MS, parseCollectError } from '$lib/collect';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const supabase = locals.supabase;
	const username = params.username.toLowerCase();

	const { data: profile } = await supabase
		.from('profiles')
		.select('*')
		.eq('username', username)
		.maybeSingle();
	if (!profile) error(404, 'No one has that username');

	const [card, fandoms, stickers] = await Promise.all([
		profile.active_card_id
			? supabase.from('cards').select('*').eq('id', profile.active_card_id).maybeSingle()
			: Promise.resolve({ data: null }),
		supabase.from('fandoms').select('*'),
		supabase.from('stickers').select('*')
	]);

	const placements = card.data
		? ((await supabase.from('sticker_placements').select('*').eq('card_id', card.data.id)).data ??
			[])
		: [];

	const viewer = locals.user;
	const isOwner = viewer?.id === profile.id;

	let cooldownUntil: string | null = null;
	let theyHaveMine = false;
	if (viewer && !isOwner) {
		const [last, mutual] = await Promise.all([
			supabase
				.from('collections')
				.select('collected_at')
				.eq('collector_id', viewer.id)
				.eq('owner_id', profile.id)
				.order('collected_at', { ascending: false })
				.limit(1)
				.maybeSingle(),
			supabase
				.from('collections')
				.select('id', { count: 'exact', head: true })
				.eq('collector_id', profile.id)
				.eq('owner_id', viewer.id)
		]);
		if (last.data) {
			const until = new Date(last.data.collected_at).getTime() + COLLECT_COOLDOWN_MS;
			if (until > Date.now()) cooldownUntil = new Date(until).toISOString();
		}
		theyHaveMine = (mutual.count ?? 0) > 0;
	}

	return {
		profile,
		card: card.data,
		placements,
		fandoms: fandoms.data ?? [],
		stickers: stickers.data ?? [],
		isOwner,
		cooldownUntil,
		theyHaveMine
	};
};

export const actions: Actions = {
	collect: async ({ locals, params }) => {
		if (!locals.session) {
			return fail(401, {
				code: 'not_authenticated',
				hint: 'Sign in to collect cards.',
				retryAt: null
			});
		}
		const { data, error: err } = await locals.supabase.rpc('collect_card', {
			target_username: params.username.toLowerCase()
		});
		if (err) {
			const parsed = parseCollectError(err);
			return fail(parsed.code === 'unknown' ? 500 : 400, parsed);
		}
		const result = (data ?? {}) as { bonus_sticker_id?: string | null; collection_id?: string };
		return {
			collected: true,
			bonusStickerId: result.bonus_sticker_id ?? null,
			collectionId: result.collection_id ?? null
		};
	}
};
