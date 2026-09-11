import type { ParamMatcher } from '@sveltejs/kit';
import { USERNAME_PATTERN } from '$lib/username';

// Only route /[username] for things that could actually be a username, so
// unrelated paths fall through to a normal 404 instead of a profile lookup.
export const match: ParamMatcher = (param) => USERNAME_PATTERN.test(param.toLowerCase());
