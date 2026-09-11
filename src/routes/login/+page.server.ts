import { fail, redirect } from '@sveltejs/kit';
import { safeNext, str } from '$lib/server/forms';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.session) redirect(303, safeNext(url.searchParams.get('next')));
	return {
		next: safeNext(url.searchParams.get('next')),
		authError: url.searchParams.get('error') === 'auth'
	};
};

export const actions: Actions = {
	signin: async ({ request, locals }) => {
		const form = await request.formData();
		const email = str(form, 'email', 254);
		const password = str(form, 'password', 200);
		const next = safeNext(form.get('next'));

		if (!email || !password) {
			return fail(400, { mode: 'signin', email, error: 'Enter your email and password.' });
		}

		const { error } = await locals.supabase.auth.signInWithPassword({ email, password });
		if (error) return fail(400, { mode: 'signin', email, error: error.message });

		redirect(303, next);
	},

	signup: async ({ request, locals, url }) => {
		const form = await request.formData();
		const email = str(form, 'email', 254);
		const password = str(form, 'password', 200);
		const next = safeNext(form.get('next'));

		if (!email || password.length < 8) {
			return fail(400, {
				mode: 'signup',
				email,
				error: 'Enter an email and a password of at least 8 characters.'
			});
		}

		const { data, error } = await locals.supabase.auth.signUp({
			email,
			password,
			options: {
				emailRedirectTo: `${url.origin}/auth/callback?next=${encodeURIComponent(next)}`
			}
		});
		if (error) return fail(400, { mode: 'signup', email, error: error.message });

		// Email confirmation disabled in the Supabase project: signed in right away.
		if (data.session) redirect(303, `/onboarding?next=${encodeURIComponent(next)}`);

		return { mode: 'signup', email, checkEmail: true };
	}
};
