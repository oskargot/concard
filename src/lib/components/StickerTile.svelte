<script lang="ts">
	/**
	 * A loose sticker in a grid (the inventory, the editor's tray). A foiled one
	 * is drawn by the card's foil engine, lit as the app lights a loose sticker:
	 * as if placed at the centre of a card sized so that the sticker is its base
	 * width (`StickerFoil.tsx`'s `looseCard`). Plain ones, and every sticker
	 * until the engine has loaded, are their plain art.
	 */
	import { onMount } from 'svelte';
	import type { Image as CkImage } from 'canvaskit-wasm';
	import { bakedArt } from '$lib/card';
	import { decoArt, decoBox, lookFor, type CatalogSticker } from '$lib/stickers/resolve';
	import { fandomSvgLayout } from '$lib/stickers/fandom-svg';
	import { looseCard, type FoilEngine, type Sprite } from '$lib/foil/engine';
	import { foil as foilAction, foilEngine } from '$lib/foil/scheduler';
	import { fandomBitmaps } from '$lib/foil/sticker-art';
	import type { Sticker, StickerFoil } from '$lib/types';
	import StickerGlyph from './StickerGlyph.svelte';
	import FandomSticker from './FandomSticker.svelte';

	let {
		sticker,
		foil = 'none',
		selected = false,
		disabled = false,
		title,
		onclick
	}: {
		sticker: Sticker | undefined;
		foil?: StickerFoil;
		selected?: boolean;
		disabled?: boolean;
		title?: string;
		onclick?: () => void;
	} = $props();

	const look = $derived(
		sticker
			? lookFor(
					{ sticker_id: sticker.id, x: 0, y: 0, rotation: 0, scale: 1, z_index: 0, foil },
					sticker as CatalogSticker
				)
			: ({ kind: 'legacy' } as const)
	);
	const baked = $derived(bakedArt(sticker));

	let area = $state(0);
	let dpr = $state(1);
	let reduceMotion = $state(false);
	onMount(() => {
		dpr = window.devicePixelRatio || 1;
		reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
	});

	/** The sticker's box in px: its base size is the tile's art area. */
	const box = $derived.by(() => {
		if (area <= 0) return null;
		if (look.kind === 'deco') return decoBox(look.aspect, area);
		if (look.kind === 'fandom') {
			const svg = fandomSvgLayout(look.label, look.styleCategory, area);
			return svg ? { width: svg.width, height: svg.height } : null;
		}
		if (baked) return { width: area, height: area };
		return null;
	});

	let engine = $state<FoilEngine | null>(null);
	let sprite = $state.raw<Sprite | null>(null);
	let painted = $state(false);

	$effect(() => {
		if (foil !== 'none' && box && !engine) foilEngine().then((e) => (engine = e));
	});

	$effect(() => {
		const e = engine;
		const b = box;
		if (!e || !b || foil === 'none') {
			sprite = null;
			return;
		}
		let live = true;
		let load: Promise<{ art: CkImage; mask: CkImage | null } | null>;
		if (look.kind === 'deco') {
			const l = look;
			load = Promise.all([e.image(decoArt(l, area, dpr)), e.image(l.mask)]).then(([a, m]) =>
				a ? { art: a, mask: m } : null
			);
		} else if (look.kind === 'fandom') {
			load = fandomBitmaps(e, look.label, look.styleCategory, area, dpr);
		} else if (baked) {
			load = Promise.all([e.image(baked.src), e.image(baked.mask)]).then(([a, m]) =>
				a ? { art: a, mask: m } : null
			);
		} else {
			sprite = null;
			return;
		}
		load.then((l) => {
			if (!live) return;
			const card = looseCard(b.width, b.height);
			sprite = l
				? {
						art: l.art,
						mask: l.mask,
						w: b.width,
						h: b.height,
						cx: card.cx,
						cy: card.cy,
						rotation: 0,
						scale: 1,
						foil
					}
				: null;
		});
		return () => {
			live = false;
		};
	});
</script>

<button type="button" class="tile foil-{foil}" class:selected {disabled} {onclick} {title}>
	<span class="glyph" bind:clientWidth={area} class:painted={painted && !!sprite}>
		{#if look.kind === 'deco'}
			<img
				src={decoArt(look, area || 64, dpr)}
				alt=""
				draggable="false"
				style="aspect-ratio: {look.aspect}"
			/>
		{:else if look.kind === 'fandom'}
			{#if area > 0}
				<FandomSticker label={look.label} styleCategory={look.styleCategory} width={area} />
			{/if}
		{:else}
			<StickerGlyph {sticker} label={false} />
		{/if}
	</span>
	{#if sprite && box}
		{@const s = sprite}
		{@const card = looseCard(box.width, box.height)}
		<canvas
			class="paint"
			style="width: {box.width}px; height: {box.height}px;"
			use:foilAction={{
				animate: !reduceMotion,
				draw: (e, canvas, time) => {
					e.drawSprites(
						canvas,
						card,
						{ x: card.cx - s.w / 2, y: card.cy - s.h / 2, w: s.w, h: s.h },
						dpr,
						{ tilt: [0, 0], time },
						[s]
					);
					painted = true;
				}
			}}
		></canvas>
	{/if}
</button>

<style>
	.tile {
		position: relative;
		display: flex;
		aspect-ratio: 1;
		width: 100%;
		align-items: center;
		justify-content: center;
		border-radius: 0.65rem;
		border: 1px solid var(--color-line);
		background: var(--color-surface);
		overflow: hidden;
		padding: 0.5rem;
		transition: transform 0.1s;
	}
	.tile:active:not(:disabled) {
		transform: scale(0.94);
	}
	.tile:disabled {
		cursor: default;
		opacity: 0.45;
	}
	.foil-glitter {
		border-color: color-mix(in srgb, var(--color-holo) 55%, var(--color-line));
	}
	.foil-holo,
	.foil-cosmic,
	.foil-mosaic {
		border-color: var(--color-holo);
	}
	.glyph {
		position: relative;
		display: grid;
		height: 100%;
		width: 100%;
		place-items: center;
		font-size: 1.6rem;
		line-height: 1;
	}
	.glyph img {
		display: block;
		max-width: 100%;
		max-height: 100%;
	}
	.glyph.painted {
		visibility: hidden;
	}
	.paint {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		pointer-events: none;
	}
</style>
