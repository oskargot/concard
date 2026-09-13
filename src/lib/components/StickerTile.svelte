<script lang="ts">
	import { bakedArt } from '$lib/card';
	import type { Sticker, StickerFoil } from '$lib/types';
	import StickerGlyph from './StickerGlyph.svelte';
	import FoilFx from './FoilFx.svelte';
	import HoloFoilFx, { type HoloVariant } from './HoloFoilFx.svelte';

	let {
		sticker,
		foil = 'none',
		selected = false,
		disabled = false,
		title,
		onclick,
		/** Experimental pointer/tilt-driven prismatic foil, off by default — see /dev/holo-fx. */
		holoFx = false,
		holoVariant = 'linear'
	}: {
		sticker: Sticker | undefined;
		foil?: StickerFoil;
		selected?: boolean;
		disabled?: boolean;
		title?: string;
		onclick?: () => void;
		holoFx?: boolean;
		holoVariant?: HoloVariant;
	} = $props();

	// A baked sticker fills the glyph box, rim and shadows included, so its mask
	// covers the whole box too. A live glyph only inks part of its box, which is
	// what the 0.82 default allows for.
	const iconSize = $derived(bakedArt(sticker) ? 1 : 0.82);
</script>

<button type="button" class="tile foil-{foil}" class:selected {disabled} {onclick} {title}>
	<span class="glyph"><StickerGlyph {sticker} label={false} /></span>
	<FoilFx {foil} {sticker} {iconSize} />
	{#if holoFx}
		<HoloFoilFx {sticker} variant={holoVariant} {iconSize} />
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
	.foil-holo {
		border-color: var(--color-holo);
	}
	.glyph {
		position: relative;
		z-index: 1;
		display: grid;
		height: 100%;
		width: 100%;
		place-items: center;
		font-size: 1.6rem;
		line-height: 1;
	}
	.selected {
		outline: 2px solid var(--color-holo);
		outline-offset: 2px;
	}
</style>
