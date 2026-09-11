import { fail, redirect } from '@sveltejs/kit';
import { IMAGE_MAX_BYTES, IMAGE_TYPES, imageExt, isHttpUrl, str } from '$lib/server/forms';
import type { Json } from '$lib/supabase/types';
import type { ProfileLink } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	return { profile: locals.profile! };
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const form = await request.formData();
		const displayName = str(form, 'display_name', 40);
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

		if (!displayName) return fail(400, { error: 'Display name is required.' });

		const { error } = await locals.supabase
			.from('profiles')
			.update({ display_name: displayName, bio, links: links as unknown as Json })
			.eq('id', locals.user!.id);
		if (error) return fail(400, { error: error.hint ?? error.message });

		redirect(303, '/me');
	},

	avatar: async ({ request, locals }) => {
		const form = await request.formData();
		const file = form.get('avatar');
		if (!(file instanceof File) || file.size === 0) return fail(400, { error: 'Choose an image.' });
		if (!IMAGE_TYPES.has(file.type)) return fail(400, { error: 'Use a PNG, JPEG, WebP or GIF.' });
		if (file.size > IMAGE_MAX_BYTES) return fail(400, { error: 'Images must be under 5 MB.' });

		const uid = locals.user!.id;
		const path = `${uid}/avatar-${Date.now()}.${imageExt(file.type)}`;
		const upload = await locals.supabase.storage
			.from('card-art')
			.upload(path, await file.arrayBuffer(), { contentType: file.type });
		if (upload.error) return fail(400, { error: upload.error.message });

		const { data } = locals.supabase.storage.from('card-art').getPublicUrl(path);
		const { error } = await locals.supabase
			.from('profiles')
			.update({ avatar_url: data.publicUrl })
			.eq('id', uid);
		if (error) return fail(400, { error: error.message });
		return { ok: true };
	}
};
