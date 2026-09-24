import { error, fail, redirect } from '@sveltejs/kit';
import { normalizeFoil } from '$lib/card';
import {
	ART_DEFAULT,
	ART_SCALE_RANGE,
	BADGE_HOME,
	STICKER_X_RANGE,
	STICKER_Y_RANGE
} from '$lib/card-style';
import { IMAGE_MAX_BYTES, IMAGE_TYPES, imageExt, num, str } from '$lib/server/forms';
import type { Json } from '$lib/supabase/types';
import type { CardLink } from '$lib/types';
import { LINKS_LIVE_MAX, linksToJson, normalizeLinks, normalizeUrl } from '$lib/app-card/links';
import { BIO_MAX, isLinkUrl, styleForSave } from '$lib/card';

/** A check violation on the links shape constraint (the old six-link cap). */
function isLinksCapViolation(err: { code?: string; message?: string }): boolean {
	return err.code === '23514' && /cards_links_valid/.test(err.message ?? '');
}
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
	// A plain and a foil copy of the same sticker are different piles, so the
	// count is keyed by sticker + foil tier, not sticker alone. The free
	// affiliation never used a copy (sticker_available_count() skips it too).
	const myCardIds = (myCards.data ?? []).map((c) => c.id);
	const placedEverywhere = myCardIds.length
		? (
				(await supabase.from('sticker_placements').select('*').in('card_id', myCardIds)).data ?? []
			).filter((p) => !p.is_affiliation)
		: [];
	const pileKey = (sticker_id: string, foil: string) => `${sticker_id}:${foil}`;
	const placedCount = new Map<string, number>();
	for (const p of placedEverywhere) {
		const key = pileKey(p.sticker_id, normalizeFoil(p.foil));
		placedCount.set(key, (placedCount.get(key) ?? 0) + 1);
	}

	const available = (inventory.data ?? [])
		.map((row) => {
			const foil = normalizeFoil(row.foil);
			return {
				sticker_id: row.sticker_id,
				foil,
				owned: row.quantity,
				available: row.quantity - (placedCount.get(pileKey(row.sticker_id, foil)) ?? 0)
			};
		})
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
	/**
	 * One save for the card: what it says (its own name, pronouns, bio and
	 * links, each inheriting the profile's when it says the same), and how it
	 * looks. Only columns this editor edits are written, and the style is
	 * merged into what is stored, so keys the web doesn't edit survive.
	 */
	save: async ({ request, locals, params }) => {
		const { data: card } = await locals.supabase
			.from('cards')
			.select('*')
			.eq('id', params.id)
			.eq('owner_id', locals.user!.id)
			.maybeSingle();
		if (!card) error(404, 'Card not found');
		const profile = locals.profile!;
		const form = await request.formData();

		const displayName = str(form, 'display_name', 40);
		if (!displayName) return fail(400, { error: 'Your card needs a name.' });

		let links: CardLink[];
		try {
			links = normalizeLinks(JSON.parse(String(form.get('links') ?? '[]')));
		} catch {
			return fail(400, { error: 'Those links could not be read.' });
		}
		for (const l of links) {
			if (!isLinkUrl(normalizeUrl(l.url))) {
				return fail(400, { error: `"${l.url}" is not a link that can be opened.` });
			}
		}
		const linkRows = linksToJson(links);

		const photoHeight = Number(form.get('photo_height'));
		const style = styleForSave(
			card.style,
			{
				frame: str(form, 'frame', 20),
				bg: str(form, 'bg', 20),
				photo_shape: str(form, 'photo_shape', 20),
				alignment: str(form, 'alignment', 20),
				photo_height: Number.isFinite(photoHeight) ? photoHeight : undefined
			},
			linkRows.length
		);

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

		// Blank, or the same as the profile's: both mean "inherit" (null).
		const override = (value: string, inherited: string | null | undefined) => {
			const v = value.trim();
			return !v || v === (inherited ?? '').trim() ? null : v;
		};

		const update = {
			display_name: override(displayName, profile.display_name),
			pronouns: override(str(form, 'pronouns', 30), profile.pronouns),
			bio: override(str(form, 'bio', BIO_MAX), profile.bio),
			links: linkRows as unknown as Json,
			style: style as unknown as Json,
			affiliation,
			// The badge is dragged on the card, so its position arrives with the
			// form. Its centre stays on the card; the column check enforces it too.
			affiliation_x: num(form, 'affiliation_x', BADGE_HOME.x, ...STICKER_X_RANGE),
			affiliation_y: num(form, 'affiliation_y', BADGE_HOME.y, ...STICKER_Y_RANGE),
			art_x: num(form, 'art_x', ART_DEFAULT.x, 0, 1),
			art_y: num(form, 'art_y', ART_DEFAULT.y, 0, 1),
			art_scale: num(form, 'art_scale', ART_DEFAULT.scale, ...ART_SCALE_RANGE)
		};

		let { error: err } = await locals.supabase.from('cards').update(update).eq('id', params.id);
		// Until the card spec's links check is live everywhere, the old one
		// allows six. Save the first six rather than lose the whole save, and
		// say so (the app's editor degrades the same way).
		let capped = false;
		if (err && isLinksCapViolation(err) && linkRows.length > LINKS_LIVE_MAX) {
			capped = true;
			update.links = linkRows.slice(0, LINKS_LIVE_MAX) as unknown as Json;
			({ error: err } = await locals.supabase.from('cards').update(update).eq('id', params.id));
		}
		if (err) return fail(400, { error: err.hint ?? err.message });

		return {
			saved: true,
			notice: capped ? `Only your first ${LINKS_LIVE_MAX} links are saving for now.` : null
		};
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
