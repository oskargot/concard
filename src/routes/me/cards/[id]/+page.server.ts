import { error, fail, redirect } from '@sveltejs/kit';
import { normalizeStyle } from '$lib/card-style';
import { IMAGE_MAX_BYTES, IMAGE_TYPES, imageExt, isHttpUrl, str } from '$lib/server/forms';
import type { Json } from '$lib/supabase/types';
import type { ProfileLink } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const supabase = locals.supabase;
	const uid = locals.user!.id;

	const { data: card } = await supabase
		.from('cards')
		.select('*')
		.eq('id', params.id)
		.eq('owner_id', uid)
		.maybeSingle();
	if (!card) error(404, 'Card not found');

	const [fandoms, stickers, inventory, placements, myCards] = await Promise.all([
		supabase.from('fandoms').select('*').eq('is_active', true).order('sort_order'),
		supabase.from('stickers').select('*').eq('is_active', true).order('sort_order'),
		supabase.from('sticker_inventory').select('*').eq('owner_id', uid),
		supabase.from('sticker_placements').select('*').eq('card_id', card.id).order('z_index'),
		supabase.from('cards').select('id').eq('owner_id', uid)
	]);

	// Copies placed on any of my cards count against what I can still place.
	const myCardIds = (myCards.data ?? []).map((c) => c.id);
	const placedEverywhere = myCardIds.length
		? ((await supabase.from('sticker_placements').select('sticker_id').in('card_id', myCardIds))
				.data ?? [])
		: [];
	const placedCount = new Map<string, number>();
	for (const p of placedEverywhere)
		placedCount.set(p.sticker_id, (placedCount.get(p.sticker_id) ?? 0) + 1);

	const available = (inventory.data ?? [])
		.map((row) => ({
			sticker_id: row.sticker_id,
			owned: row.quantity,
			available: row.quantity - (placedCount.get(row.sticker_id) ?? 0)
		}))
		.filter((row) => row.owned > 0);

	return {
		card,
		profile: locals.profile!,
		isActive: locals.profile!.active_card_id === card.id,
		fandoms: fandoms.data ?? [],
		stickers: stickers.data ?? [],
		placements: placements.data ?? [],
		available
	};
};

async function ownCard(locals: App.Locals, id: string) {
	const { data } = await locals.supabase
		.from('cards')
		.select('id')
		.eq('id', id)
		.eq('owner_id', locals.user!.id)
		.maybeSingle();
	if (!data) error(404, 'Card not found');
}

export const actions: Actions = {
	/** One save for everything on the screen: who you are (profile) and how this card looks (card). */
	save: async ({ request, locals, params }) => {
		await ownCard(locals, params.id);
		const form = await request.formData();

		const displayName = str(form, 'display_name', 40);
		if (!displayName) return fail(400, { error: 'Your card needs a name.' });
		const bio = str(form, 'bio', 200);

		const labels = form.getAll('link_label').map((v) => String(v).trim().slice(0, 30));
		const urls = form.getAll('link_url').map((v) => String(v).trim().slice(0, 500));
		const links: ProfileLink[] = [];
		for (let i = 0; i < Math.min(urls.length, 8); i++) {
			if (!urls[i]) continue;
			const url = /^https?:\/\//i.test(urls[i]) ? urls[i] : `https://${urls[i]}`;
			if (!isHttpUrl(url)) return fail(400, { error: `"${urls[i]}" is not a valid link.` });
			links.push({ label: labels[i] || new URL(url).hostname.replace(/^www\./, ''), url });
		}

		const style = normalizeStyle({
			frame: str(form, 'frame', 20),
			bg: str(form, 'bg', 20),
			shape: str(form, 'shape', 20),
			photo_shape: str(form, 'photo_shape', 20)
		});

		const affiliationRaw = str(form, 'affiliation', 40);
		let affiliation: string | null = null;
		if (affiliationRaw) {
			const { data: f } = await locals.supabase
				.from('fandoms')
				.select('id')
				.eq('id', affiliationRaw)
				.eq('is_active', true)
				.maybeSingle();
			if (!f) return fail(400, { error: 'Pick a fandom from the list.' });
			affiliation = f.id;
		}

		const profileUpdate = await locals.supabase
			.from('profiles')
			.update({ display_name: displayName, bio, links: links as unknown as Json })
			.eq('id', locals.user!.id);
		if (profileUpdate.error)
			return fail(400, { error: profileUpdate.error.hint ?? profileUpdate.error.message });

		const cardUpdate = await locals.supabase
			.from('cards')
			.update({ style: style as unknown as Json, affiliation })
			.eq('id', params.id);
		if (cardUpdate.error)
			return fail(400, { error: cardUpdate.error.hint ?? cardUpdate.error.message });

		return { saved: true };
	},

	art: async ({ request, locals, params }) => {
		await ownCard(locals, params.id);
		const form = await request.formData();
		const file = form.get('art');
		if (!(file instanceof File) || file.size === 0) return fail(400, { error: 'Choose an image.' });
		if (!IMAGE_TYPES.has(file.type)) return fail(400, { error: 'Use a PNG, JPEG, WebP or GIF.' });
		if (file.size > IMAGE_MAX_BYTES) return fail(400, { error: 'Images must be under 5 MB.' });

		const path = `${locals.user!.id}/${params.id}-${Date.now()}.${imageExt(file.type)}`;
		const upload = await locals.supabase.storage
			.from('card-art')
			.upload(path, await file.arrayBuffer(), { contentType: file.type });
		if (upload.error) return fail(400, { error: upload.error.message });

		const { data } = locals.supabase.storage.from('card-art').getPublicUrl(path);
		const { error: err } = await locals.supabase
			.from('cards')
			.update({ art_url: data.publicUrl })
			.eq('id', params.id);
		if (err) return fail(400, { error: err.message });
		return { saved: true };
	},

	removeArt: async ({ locals, params }) => {
		await ownCard(locals, params.id);
		await locals.supabase.from('cards').update({ art_url: null }).eq('id', params.id);
		return { saved: true };
	},

	setActive: async ({ locals, params }) => {
		await ownCard(locals, params.id);
		const { error: err } = await locals.supabase
			.from('profiles')
			.update({ active_card_id: params.id })
			.eq('id', locals.user!.id);
		if (err) return fail(400, { error: err.hint ?? err.message });
		return { saved: true };
	},

	delete: async ({ locals, params }) => {
		await ownCard(locals, params.id);
		const { error: err } = await locals.supabase.from('cards').delete().eq('id', params.id);
		if (err) return fail(400, { error: err.hint ?? err.message });
		redirect(303, '/me');
	}
};
