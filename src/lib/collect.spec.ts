import { describe, expect, it } from 'vitest';
import { formatRetryIn, parseCollectError } from './collect';

describe('parseCollectError', () => {
	it('maps known codes and keeps the hint', () => {
		const e = parseCollectError({ message: 'cannot_collect_self', hint: 'That is your own card.' });
		expect(e.code).toBe('cannot_collect_self');
		expect(e.hint).toBe('That is your own card.');
		expect(e.retryAt).toBeNull();
	});
	it('reads the retry time out of a cooldown error', () => {
		const e = parseCollectError({
			message: 'cooldown',
			hint: 'You already collected this card recently.',
			details: '2026-09-14 12:00:00+00'
		});
		expect(e.code).toBe('cooldown');
		expect(e.retryAt).toBe('2026-09-14T12:00:00.000Z');
	});
	it('falls back to unknown with a generic hint', () => {
		const e = parseCollectError({ message: 'connection reset' });
		expect(e.code).toBe('unknown');
		expect(e.hint).toMatch(/try again/i);
	});
});

describe('formatRetryIn', () => {
	const now = Date.parse('2026-09-11T12:00:00Z');
	it('rounds up to hours and then days', () => {
		expect(formatRetryIn('2026-09-11T12:30:00Z', now)).toBe('1 hour');
		expect(formatRetryIn('2026-09-11T20:00:00Z', now)).toBe('8 hours');
		expect(formatRetryIn('2026-09-14T11:00:00Z', now)).toBe('3 days');
	});
	it('says now once the time has passed', () => {
		expect(formatRetryIn('2026-09-11T11:00:00Z', now)).toBe('now');
	});
});
