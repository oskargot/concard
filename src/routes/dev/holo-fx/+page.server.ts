import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Isolated test bed for the experimental prismatic foil effect
// (HoloFoilFx.svelte), toggled independently of the real sticker screens.
// Dev server only.
export const load: PageServerLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
