import { env } from '$env/dynamic/public';

/** Supabase connection settings, read at runtime so builds don't need a .env. */
export function supabaseEnv() {
	const url = env.PUBLIC_SUPABASE_URL;
	const key = env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
	if (!url || !key) {
		throw new Error(
			'Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env and fill it in.'
		);
	}
	return { url, key };
}

/** Public origin for QR codes and share links; falls back to the request origin. */
export function siteOrigin(requestOrigin: string): string {
	return (env.PUBLIC_SITE_URL || requestOrigin).replace(/\/$/, '');
}
