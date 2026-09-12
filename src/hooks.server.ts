import { createServerClient } from '@supabase/ssr';
import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { missingSupabaseEnv, supabaseEnv } from '$lib/supabase/env';
import { setupPage } from '$lib/server/setup-page';

// Routes that require a signed-in user with a finished profile.
const PROTECTED_PREFIXES = ['/me', '/binder', '/scan', '/stickers', '/admin'];

const supabase: Handle = async ({ event, resolve }) => {
	// A deploy without its environment variables would 500 on every request.
	// Show a setup page that names what's missing instead.
	const missing = missingSupabaseEnv();
	if (missing.length) {
		console.error(`concard: missing environment variables: ${missing.join(', ')}`);
		return setupPage(missing);
	}

	const { url, key } = supabaseEnv();

	event.locals.supabase = createServerClient(url, key, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookiesToSet) => {
				for (const { name, value, options } of cookiesToSet) {
					event.cookies.set(name, value, { ...options, path: '/' });
				}
			}
		}
	});

	/**
	 * getSession() alone trusts the cookie; getUser() validates the JWT with
	 * Supabase. Use both so server code never acts on a forged session.
	 */
	event.locals.safeGetSession = async () => {
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();
		if (!session) return { session: null, user: null };

		const {
			data: { user },
			error
		} = await event.locals.supabase.auth.getUser();
		if (error || !user) return { session: null, user: null };

		return { session, user };
	};

	return resolve(event, {
		filterSerializedResponseHeaders: (name) =>
			name === 'content-range' || name === 'x-supabase-api-version'
	});
};

const authGuard: Handle = async ({ event, resolve }) => {
	const { session, user } = await event.locals.safeGetSession();
	event.locals.session = session;
	event.locals.user = user;
	event.locals.profile = null;

	if (user) {
		const { data } = await event.locals.supabase
			.from('profiles')
			.select('*')
			.eq('id', user.id)
			.maybeSingle();
		event.locals.profile = data ?? null;
	}

	const path = event.url.pathname;
	const isProtected = PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));

	if (!session && isProtected) {
		redirect(303, `/login?next=${encodeURIComponent(path + event.url.search)}`);
	}

	// Signed in but never picked a username: finish onboarding first.
	if (session && !event.locals.profile && isProtected) {
		redirect(303, `/onboarding?next=${encodeURIComponent(path + event.url.search)}`);
	}

	if (session && event.locals.profile && path === '/onboarding') {
		redirect(303, '/me');
	}

	return resolve(event);
};

export const handle = sequence(supabase, authGuard);
