import { DEMO_CARD } from '$lib/demo-card';
import { qrSvg } from '$lib/server/qr';
import { siteOrigin } from '$lib/supabase/env';
import { profileUrl } from '$lib/username';
import type { PageServerLoad } from './$types';

/** How many of the most recent collections the home page shows. */
const RECENT = 6;

/**
 * Signed in, the home page is a dashboard: your card on display, then the cards
 * you most recently collected. Signed out it falls back to the demo card and
 * the pitch, so the page still shows the product rather than describing it.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const origin = siteOrigin(url.origin);
	const profile = locals.profile;

	if (!profile) {
		const link = profileUrl(origin, DEMO_CARD.handle);
		return {
			mine: null,
			recent: [],
			stickers: [],
			link: link.replace(/^https?:\/\//, ''),
			qr: await qrSvg(link)
		};
	}

	const supabase = locals.supabase;
	const [card, fandoms, stickers, recent] = await Promise.all([
		profile.active_card_id
			? supabase.from('cards').select('*').eq('id', profile.active_card_id).maybeSingle()
			: Promise.resolve({ data: null }),
		supabase.from('fandoms').select('*'),
		supabase.from('stickers').select('*'),
		supabase
			.from('collections')
			.select('id, card_snapshot, collected_at')
			.eq('collector_id', profile.id)
			.order('collected_at', { ascending: false })
			.limit(RECENT)
	]);

	const placements = card.data
		? ((await supabase.from('sticker_placements').select('*').eq('card_id', card.data.id)).data ??
			[])
		: [];

	const link = profileUrl(origin, profile.username);
	return {
		mine: card.data ? { card: card.data, fandoms: fandoms.data ?? [], placements } : null,
		recent: recent.data ?? [],
		stickers: stickers.data ?? [],
		link: link.replace(/^https?:\/\//, ''),
		qr: await qrSvg(link)
	};
};
