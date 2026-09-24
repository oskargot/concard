import { error, fail } from '@sveltejs/kit';
import {
	imageExt,
	num,
	str,
	STICKER_IMAGE_MAX_BYTES,
	STICKER_IMAGE_TYPES
} from '$lib/server/forms';
import type { Database, StickerRarity, StickerSource } from '$lib/supabase/types';
import type { Actions, PageServerLoad } from './$types';

const SLUG = /^[a-z0-9][a-z0-9-]{1,29}$/;
const RARITIES: readonly StickerRarity[] = ['common', 'uncommon', 'rare', 'legendary'];
const SOURCES: readonly StickerSource[] = ['starter', 'drop', 'shop', 'event'];

function isRarity(v: string): v is StickerRarity {
	return (RARITIES as readonly string[]).includes(v);
}
function isSource(v: string): v is StickerSource {
	return (SOURCES as readonly string[]).includes(v);
}

function requireAdmin(locals: App.Locals) {
	if (!locals.profile?.is_admin) error(404, 'Not found');
}

async function uploadArt(
	locals: App.Locals,
	stickerId: string,
	file: File
): Promise<{ url?: string; error?: string }> {
	if (!STICKER_IMAGE_TYPES.has(file.type)) {
		return { error: 'Use a PNG or WebP with a transparent background.' };
	}
	if (file.size > STICKER_IMAGE_MAX_BYTES) return { error: 'Images must be under 2 MB.' };

	const path = `${stickerId}-${Date.now()}.${imageExt(file.type)}`;
	const upload = await locals.supabase.storage
		.from('sticker-art')
		.upload(path, await file.arrayBuffer(), { contentType: file.type });
	if (upload.error) return { error: upload.error.message };

	const { data } = locals.supabase.storage.from('sticker-art').getPublicUrl(path);
	return { url: data.publicUrl };
}

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	const { data } = await locals.supabase
		.from('stickers')
		.select('*')
		.order('sort_order')
		.order('id');
	return { stickers: data ?? [] };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		requireAdmin(locals);
		const form = await request.formData();

		const id = str(form, 'id', 30).toLowerCase();
		if (!SLUG.test(id)) {
			return fail(400, { error: 'Sticker id must be lowercase letters, numbers and hyphens.' });
		}
		const name = str(form, 'name', 40);
		if (!name) return fail(400, { error: 'Give the sticker a name.' });

		const rarityRaw = str(form, 'rarity', 20);
		const sourceRaw = str(form, 'source', 20);
		const glyph = str(form, 'glyph', 8) || null;
		const priceRaw = str(form, 'price_cents', 10);

		const file = form.get('image');
		let image_url: string | null = null;
		if (file instanceof File && file.size > 0) {
			const up = await uploadArt(locals, id, file);
			if (up.error) return fail(400, { error: up.error });
			image_url = up.url ?? null;
		}
		if (!glyph && !image_url) {
			return fail(400, { error: 'Add an image, or a fallback emoji glyph, or both.' });
		}

		const { error: err } = await locals.supabase.from('stickers').insert({
			id,
			name,
			glyph,
			image_url,
			rarity: isRarity(rarityRaw) ? rarityRaw : 'common',
			source: isSource(sourceRaw) ? sourceRaw : 'drop',
			price_cents: priceRaw ? num(form, 'price_cents', 0, 0, 100000) : null,
			sort_order: num(form, 'sort_order', 0, -1000, 1000)
		});
		if (err) {
			return fail(400, {
				error: err.message.includes('duplicate') ? 'That sticker id is already taken.' : err.message
			});
		}
		return { saved: true };
	},

	update: async ({ request, locals }) => {
		requireAdmin(locals);
		const form = await request.formData();

		const id = str(form, 'id', 30);
		if (!id) return fail(400, { error: 'Missing sticker id.' });
		const name = str(form, 'name', 40);
		if (!name) return fail(400, { error: 'Give the sticker a name.' });

		const rarityRaw = str(form, 'rarity', 20);
		const sourceRaw = str(form, 'source', 20);
		const priceRaw = str(form, 'price_cents', 10);

		const patch: Database['public']['Tables']['stickers']['Update'] = {
			name,
			glyph: str(form, 'glyph', 8) || null,
			rarity: isRarity(rarityRaw) ? rarityRaw : 'common',
			source: isSource(sourceRaw) ? sourceRaw : 'drop',
			price_cents: priceRaw ? num(form, 'price_cents', 0, 0, 100000) : null,
			sort_order: num(form, 'sort_order', 0, -1000, 1000),
			is_active: form.get('is_active') === 'on'
		};

		const file = form.get('image');
		if (file instanceof File && file.size > 0) {
			const up = await uploadArt(locals, id, file);
			if (up.error) return fail(400, { error: up.error });
			patch.image_url = up.url;
		}

		const { error: err } = await locals.supabase.from('stickers').update(patch).eq('id', id);
		if (err) return fail(400, { error: err.message });
		return { saved: true };
	}
};
