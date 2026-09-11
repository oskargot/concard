import { fail, redirect } from '@sveltejs/kit';
import { safeNext, str } from '$lib/server/forms';
import { isValidUsername, normalizeUsername } from '$lib/username';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.session)
		redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	return { next: safeNext(url.searchParams.get('next')) };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const user = locals.user;
		if (!user) redirect(303, '/login');

		const form = await request.formData();
		const username = normalizeUsername(str(form, 'username', 30));
		const displayName = str(form, 'display_name', 40) || username;
		const next = safeNext(form.get('next'));

		if (!isValidUsername(username)) {
			return fail(400, {
				username,
				displayName,
				error: 'Usernames are 3 to 20 characters: lowercase letters, numbers and underscores.'
			});
		}

		const { data: available } = await locals.supabase.rpc('is_username_available', {
			candidate: username
		});
		if (!available) {
			return fail(400, { username, displayName, error: 'That username is taken.' });
		}

		const { error } = await locals.supabase
			.from('profiles')
			.insert({ id: user.id, username, display_name: displayName });

		if (error) {
			const taken = error.code === '23505';
			return fail(400, {
				username,
				displayName,
				error: taken ? 'That username was just taken.' : (error.hint ?? error.message)
			});
		}

		redirect(303, next);
	}
};
