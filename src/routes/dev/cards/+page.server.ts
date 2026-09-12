import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Design gallery: every frame, background, silhouette and photo shape on
// fixture data, with no database behind it. Dev server only.
export const load: PageServerLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
