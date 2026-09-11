import { redirect } from '@sveltejs/kit';
import type { EmailOtpType } from '@supabase/supabase-js';
import { safeNext } from '$lib/server/forms';
import type { RequestHandler } from './$types';

/**
 * Landing point for Supabase email links (confirm signup, magic link,
 * password recovery) and OAuth redirects. Turns the one-time code into a
 * session cookie, then sends the user on their way.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const next = safeNext(url.searchParams.get('next'));
	const code = url.searchParams.get('code');
	const tokenHash = url.searchParams.get('token_hash');
	const type = url.searchParams.get('type') as EmailOtpType | null;

	let ok = false;
	if (code) {
		const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
		ok = !error;
	} else if (tokenHash && type) {
		const { error } = await locals.supabase.auth.verifyOtp({ token_hash: tokenHash, type });
		ok = !error;
	}

	if (!ok) redirect(303, '/login?error=auth');

	const {
		data: { user }
	} = await locals.supabase.auth.getUser();
	if (user) {
		const { data: profile } = await locals.supabase
			.from('profiles')
			.select('id')
			.eq('id', user.id)
			.maybeSingle();
		if (!profile) redirect(303, `/onboarding?next=${encodeURIComponent(next)}`);
	}

	redirect(303, next);
};
