import { createBrowserClient, createServerClient, isBrowser } from '@supabase/ssr';
import type { Database } from '$lib/supabase/types';
import { supabaseEnv } from '$lib/supabase/env';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ data, depends, fetch }) => {
	// Re-run this load whenever the auth state changes (see +layout.svelte).
	depends('supabase:auth');

	const { url, key } = supabaseEnv();

	const supabase = isBrowser()
		? createBrowserClient<Database>(url, key, { global: { fetch } })
		: createServerClient<Database>(url, key, {
				global: { fetch },
				cookies: { getAll: () => data.cookies }
			});

	return {
		supabase,
		session: data.session,
		user: data.user,
		profile: data.profile
	};
};
