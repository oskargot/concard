import { DEMO_CARD } from '$lib/demo-card';
import { qrSvg } from '$lib/server/qr';
import { siteOrigin } from '$lib/supabase/env';
import { profileUrl } from '$lib/username';
import type { PageServerLoad } from './$types';

/**
 * Signed in with a card on display, the home page shows your own card. Signed
 * out — or signed in but not made one yet — it falls back to the demo card, so
 * the page still shows the product rather than describing it.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const origin = siteOrigin(url.origin);
	const profile = locals.profile;

	if (profile?.active_card_id) {
		const supabase = locals.supabase;
		const [card, fandoms, stickers, placements] = await Promise.all([
			supabase.from('cards').select('*').eq('id', profile.active_card_id).maybeSingle(),
			supabase.from('fandoms').select('*'),
			supabase.from('stickers').select('*'),
			supabase.from('sticker_placements').select('*').eq('card_id', profile.active_card_id)
		]);
		if (card.data) {
			const link = profileUrl(origin, profile.username);
			return {
				mine: {
					card: card.data,
					fandoms: fandoms.data ?? [],
					stickers: stickers.data ?? [],
					placements: placements.data ?? []
				},
				link: link.replace(/^https?:\/\//, ''),
				qr: await qrSvg(link)
			};
		}
	}

	const link = profileUrl(origin, DEMO_CARD.handle);
	return { mine: null, link: link.replace(/^https?:\/\//, ''), qr: await qrSvg(link) };
};
