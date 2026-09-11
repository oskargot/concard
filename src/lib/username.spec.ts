import { describe, expect, it } from 'vitest';
import { isValidUsername, profileUrl, usernameFromScan } from './username';

describe('isValidUsername', () => {
	it('accepts lowercase letters, digits and underscores from 3 to 20 chars', () => {
		expect(isValidUsername('abc')).toBe(true);
		expect(isValidUsername('oskar_01')).toBe(true);
		expect(isValidUsername('a'.repeat(20))).toBe(true);
	});
	it('rejects uppercase, symbols, leading underscore and bad lengths', () => {
		expect(isValidUsername('Oskar')).toBe(false);
		expect(isValidUsername('ab')).toBe(false);
		expect(isValidUsername('a'.repeat(21))).toBe(false);
		expect(isValidUsername('_oskar')).toBe(false);
		expect(isValidUsername('os kar')).toBe(false);
		expect(isValidUsername('os-kar')).toBe(false);
	});
});

describe('profileUrl', () => {
	it('joins origin and username without a double slash', () => {
		expect(profileUrl('https://concard.me', 'oskar')).toBe('https://concard.me/oskar');
		expect(profileUrl('https://concard.me/', 'oskar')).toBe('https://concard.me/oskar');
	});
});

describe('usernameFromScan', () => {
	const hosts = ['concard.me', 'localhost'];
	it('reads a username from a concard profile url', () => {
		expect(usernameFromScan('https://concard.me/oskar', hosts)).toBe('oskar');
		expect(usernameFromScan('https://CONCARD.ME/Oskar/', hosts)).toBe('oskar');
		expect(usernameFromScan('http://localhost:5173/oskar?x=1', hosts)).toBe('oskar');
	});
	it('accepts a bare username', () => {
		expect(usernameFromScan('  oskar ', hosts)).toBe('oskar');
	});
	it('rejects other hosts, deep paths, reserved-looking junk and non-urls', () => {
		expect(usernameFromScan('https://evil.example/oskar', hosts)).toBeNull();
		expect(usernameFromScan('https://concard.me/oskar/cards', hosts)).toBeNull();
		expect(usernameFromScan('https://concard.me/', hosts)).toBeNull();
		expect(usernameFromScan('WIFI:S:con;P:secret;;', hosts)).toBeNull();
	});
});
