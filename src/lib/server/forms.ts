/** Only allow same-site relative redirects from user-supplied `next` values. */
export function safeNext(value: unknown, fallback = '/me'): string {
	if (typeof value !== 'string') return fallback;
	if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
	return value;
}

export function str(form: FormData, key: string, max = 1000): string {
	const v = form.get(key);
	return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

const HEX = /^#[0-9a-f]{6}$/i;

export function hexColor(form: FormData, key: string): string | undefined {
	const v = str(form, key, 7);
	return HEX.test(v) ? v.toLowerCase() : undefined;
}

export function isHttpUrl(value: string): boolean {
	try {
		const u = new URL(value);
		return u.protocol === 'https:' || u.protocol === 'http:';
	} catch {
		return false;
	}
}

export const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

// Sticker art needs real alpha transparency for the on-card die-cut effect to
// trace, which rules out jpeg/gif.
export const STICKER_IMAGE_TYPES = new Set(['image/png', 'image/webp']);
export const STICKER_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export function imageExt(type: string): string {
	return (
		{ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[type] ??
		'bin'
	);
}

/** Read a bounded number from a form, falling back when absent, unparseable or out of range. */
export function num(form: FormData, key: string, fallback: number, lo: number, hi: number): number {
	const v = Number(form.get(key));
	if (!Number.isFinite(v)) return fallback;
	return Math.min(hi, Math.max(lo, v));
}
