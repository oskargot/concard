import { describe, expect, it } from 'vitest';
import { snapshotToView } from './card';
import { normalizeStyle, randomStyle, stickerRotation } from './card-style';

describe('snapshotToView', () => {
	it('maps a version 1 snapshot forward to the default look', () => {
		const v = snapshotToView({
			version: 1,
			card_id: 'c1',
			template_id: 'holo',
			title: 'Alice the Bold',
			subtitle: 'Cosplayer',
			flavor_text: 'Tea person.',
			art_url: null,
			colors: { primary: '#123456' },
			stickers: [{ sticker_id: 'star', x: 0.2, y: 0.3 }],
			owner: { id: 'u1', username: 'alice', display_name: 'Alice', avatar_url: null }
		});
		expect(v.version).toBe(2);
		expect(v.style).toEqual({
			frame: 'silver',
			bg: 'paper',
			shape: 'rounded',
			photo_shape: 'round'
		});
		expect(v.bio).toBe('Tea person.');
		expect(v.handle).toBe('alice');
		expect(v.affiliation).toBeNull();
		expect(v.links).toEqual([]);
		expect(v.stickers).toEqual([
			{ id: undefined, sticker_id: 'star', x: 0.2, y: 0.3, rotation: 0, scale: 1, z_index: 0 }
		]);
	});

	it('reads a version 2 snapshot as written by collect_card()', () => {
		const v = snapshotToView({
			version: 2,
			card_id: 'c1',
			title: 'Alice',
			bio: 'hi',
			art_url: 'https://x/y.png',
			style: { frame: 'gold', bg: 'slate', shape: 'shaved', photo_shape: 'arch' },
			affiliation: { id: 'anime', name: 'Anime', mark: 'ANI', color_a: '#f0f', color_b: '#00f' },
			links: [{ label: 'Bluesky', url: 'https://bsky.app/alice' }, { url: 'https://x.y' }],
			stickers: [],
			owner: { id: 'u1', username: 'alice', display_name: 'Alice', avatar_url: null }
		});
		expect(v.style.frame).toBe('gold');
		expect(v.style.bg).toBe('slate');
		expect(v.affiliation?.mark).toBe('ANI');
		expect(v.links).toHaveLength(2);
		expect(v.links[1].label).toBe('');
	});

	it('survives garbage', () => {
		const v = snapshotToView(null);
		expect(v.title).toBe('Untitled');
		expect(v.style.frame).toBe('silver');
		expect(v.owner.display_name).toBe('Someone');
	});
});

describe('normalizeStyle', () => {
	it('fills defaults and rejects unknown values', () => {
		expect(normalizeStyle(undefined)).toEqual({
			frame: 'silver',
			bg: 'paper',
			shape: 'rounded',
			photo_shape: 'round'
		});
		expect(normalizeStyle({ frame: 'holo', bg: 'plaid', shape: 'shaved' })).toEqual({
			frame: 'holo',
			bg: 'paper',
			shape: 'shaved',
			photo_shape: 'round'
		});
	});
});

describe('randomStyle', () => {
	it('never picks the dark background or holo for a new card', () => {
		for (let i = 0; i < 50; i++) {
			const s = randomStyle();
			expect(['silver', 'gold']).toContain(s.frame);
			expect(s.bg).not.toBe('slate');
		}
	});
});

describe('stickerRotation', () => {
	it('is deterministic and small', () => {
		expect(stickerRotation('abc')).toBe(stickerRotation('abc'));
		for (const id of ['a', 'star', 'dragon', 'zzzzzz']) {
			expect(Math.abs(stickerRotation(id))).toBeLessThanOrEqual(16);
		}
	});
});
