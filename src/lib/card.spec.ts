import { describe, expect, it } from 'vitest';
import { snapshotToView, styleForSave } from './card';
import {
	BG_KEYS,
	BGS,
	inkFor,
	luminance,
	normalizeStyle,
	randomStyle,
	stickerRotation
} from './card-style';

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
		expect(v.version).toBe(1);
		expect(v.style).toEqual({
			frame: 'silver',
			bg: 'paper',
			shape: 'rounded',
			photo_shape: 'rounded',
			alignment: 'left',
			photo_height: 140
		});
		expect(v.bio).toBe('Tea person.');
		expect(v.handle).toBe('alice');
		expect(v.affiliation).toBeNull();
		expect(v.links).toEqual([]);
		expect(v.stickers).toEqual([
			{
				id: 'star-0',
				sticker_id: 'star',
				x: 0.2,
				y: 0.3,
				rotation: 0,
				scale: 1,
				z_index: 0,
				foil: 'none',
				size: null,
				is_affiliation: false,
				kind: 'deco',
				name: undefined,
				full_path: null,
				mask_path: null,
				thumb_path: null,
				art_aspect: null,
				fandom_id: null,
				label: undefined,
				style_category: undefined
			}
		]);
	});

	it('reads a version 2 snapshot as written by collect_card()', () => {
		const v = snapshotToView({
			version: 2,
			card_id: 'c1',
			title: 'Alice',
			bio: 'hi',
			art_url: 'https://x/y.png',
			style: {
				frame: 'gold',
				bg: 'slate',
				shape: 'shaved',
				photo_shape: 'square',
				bio_align: 'right'
			},
			affiliation: { id: 'anime', name: 'Anime', mark: 'ANI', color_a: '#f0f', color_b: '#00f' },
			links: [{ label: 'Bluesky', url: 'https://bsky.app/alice' }, { url: 'https://x.y' }],
			stickers: [{ sticker_id: 'star', x: 0.2, y: 0.3, foil: 'holo' }],
			owner: { id: 'u1', username: 'alice', display_name: 'Alice', avatar_url: null }
		});
		expect(v.style.frame).toBe('gold');
		expect(v.style.bg).toBe('slate');
		// the DB's old photo-shape spelling and alignment key read as the spec's
		expect(v.style.photo_shape).toBe('sharp');
		expect(v.style.alignment).toBe('right');
		expect(v.affiliation).toMatchObject({ id: 'anime', name: 'Anime', x: 0.8, y: 0.86 });
		// a pre-spec link's label is its handle
		expect(v.links).toEqual([
			{ url: 'https://bsky.app/alice', handle: 'Bluesky' },
			{ url: 'https://x.y', handle: '' }
		]);
		expect(v.stickers[0].foil).toBe('holo');
	});

	it('reads a version 4 snapshot, stickers carrying their definitions', () => {
		const v = snapshotToView({
			version: 4,
			title: 'Rafa',
			pronouns: 'they/them',
			bio: 'hi',
			style: { photo_shape: 'circle', alignment: 'center', photo_height: 154 },
			links: [{ url: 'https://ko-fi.com/rafa', handle: 'rafa', position: 0 }],
			stickers: [
				{
					id: 'p1',
					sticker_id: 'star',
					x: 0.2,
					y: 0.3,
					foil: 'glitter',
					size: 0.24,
					kind: 'deco',
					full_path: 'star/a-full.webp',
					mask_path: 'star/a-mask.webp',
					art_aspect: 1.04
				},
				{
					id: 'p2',
					sticker_id: 'fandom-scifi',
					x: 0.8,
					y: 0.85,
					is_affiliation: true,
					size: 0.256,
					label: 'Sci-fi',
					style_category: 'retro-sci-fi'
				}
			],
			owner: { id: 'u2', username: 'rafa', display_name: 'Rafa' }
		});
		expect(v.version).toBe(4);
		expect(v.pronouns).toBe('they/them');
		expect(v.style).toMatchObject({
			photo_shape: 'circle',
			alignment: 'center',
			photo_height: 154
		});
		expect(v.stickers[0]).toMatchObject({
			kind: 'deco',
			full_path: 'star/a-full.webp',
			size: 0.24
		});
		expect(v.stickers[1]).toMatchObject({
			kind: 'fandom',
			is_affiliation: true,
			label: 'Sci-fi',
			style_category: 'retro-sci-fi'
		});
	});

	it('falls back an unknown or missing foil tier to plain', () => {
		const v = snapshotToView({
			version: 2,
			stickers: [
				{ sticker_id: 'star', x: 0, y: 0 },
				{ sticker_id: 'heart', x: 0, y: 0, foil: 'chrome' }
			],
			owner: {}
		});
		expect(v.stickers.map((s) => s.foil)).toEqual(['none', 'none']);
	});

	it('survives garbage', () => {
		const v = snapshotToView(null);
		expect(v.title).toBe('Someone');
		expect(v.style.frame).toBe('silver');
		expect(v.owner.display_name).toBe('Someone');
	});
});

describe('normalizeStyle', () => {
	it('fills defaults and rejects unknown values', () => {
		const defaults = { alignment: 'left', photo_height: 140 };
		expect(normalizeStyle(undefined)).toEqual({
			frame: 'silver',
			bg: 'paper',
			shape: 'rounded',
			photo_shape: 'rounded',
			...defaults
		});
		expect(normalizeStyle({ frame: 'holo', bg: 'plaid', shape: 'shaved' })).toEqual({
			frame: 'holo',
			bg: 'paper',
			shape: 'shaved',
			photo_shape: 'rounded',
			...defaults
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

describe('inkFor', () => {
	it('uses dark ink on light backgrounds and paper ink on dark ones', () => {
		expect(inkFor('paper').dark).toBe(false);
		expect(inkFor('amber').dark).toBe(false);
		expect(inkFor('red').dark).toBe(false);
		expect(inkFor('slate').dark).toBe(true);
		expect(inkFor('blue').dark).toBe(true);
		expect(inkFor('indigo').dark).toBe(true);
	});
	it('keeps enough contrast for every background', () => {
		for (const key of BG_KEYS) {
			const l = luminance(BGS[key]);
			const inkL = luminance(inkFor(key).ink);
			// WCAG AA for body text: the name and rules must clear 4.5:1 against the face
			const ratio = (Math.max(l, inkL) + 0.05) / (Math.min(l, inkL) + 0.05);
			expect(ratio, `${key} contrast`).toBeGreaterThan(4.5);
		}
	});
});

describe('styleForSave', () => {
	it('replaces only the edited axes and keeps keys it does not know', () => {
		const stored = {
			frame: 'gold',
			bg: 'mint',
			shape: 'shaved',
			link_layout: 'grid',
			photo_shape: 'arch'
		};
		const out = styleForSave(stored, { bg: 'slate', alignment: 'right', photo_height: 150 }, 4);
		expect(out).toMatchObject({
			frame: 'gold',
			bg: 'slate',
			shape: 'shaved',
			link_layout: 'grid',
			photo_shape: 'arch',
			alignment: 'right',
			bio_align: 'right'
		});
		// 150 is between stops; with four link rows H_max is 168
		expect(out.photo_height).toBe(154);
	});
	it('keeps the stored value for a blank edit and clamps the photo to H_max', () => {
		const out = styleForSave({ frame: 'holo', photo_height: 260 }, { frame: '' }, 8);
		expect(out.frame).toBe('holo');
		expect(out.photo_height).toBe(168);
	});
});
