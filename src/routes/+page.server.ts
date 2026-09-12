import { DEMO_CARD } from '$lib/demo-card';
import { qrSvg } from '$lib/server/qr';
import { siteOrigin } from '$lib/supabase/env';
import { profileUrl } from '$lib/username';
import type { PageServerLoad } from './$types';

// The home page shows a real card rather than describing one, so the demo
// needs a working QR the same way a signed-in user's card does.
export const load: PageServerLoad = async ({ url }) => {
	const link = profileUrl(siteOrigin(url.origin), DEMO_CARD.handle);
	return { demoLink: link.replace(/^https?:\/\//, ''), demoQr: await qrSvg(link) };
};
