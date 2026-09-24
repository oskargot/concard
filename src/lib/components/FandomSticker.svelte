<script lang="ts">
	/**
	 * A generative fandom sticker, drawn from the layout code copied verbatim
	 * from concard-app (src/lib/stickers/fandom-layout.ts) through
	 * `fandom-svg.ts`: the same layers in the same order as the app's
	 * FandomSticker.tsx. Same label, category and width in, same SVG out.
	 *
	 * Plain here; a foiled one is painted by the card's foil engine
	 * (`StickerLayer`), which rasterises this same markup.
	 */
	import { fandomSvgLayout, fandomSvgMarkup } from '$lib/stickers/fandom-svg';
	import type { FandomStyleCategory } from '$lib/stickers/types';

	interface Props {
		label: string;
		styleCategory: FandomStyleCategory;
		/** Width in px — the layout depends on the real size, as in the app. */
		width: number;
	}

	let { label, styleCategory, width }: Props = $props();

	const svg = $derived(fandomSvgLayout(label, styleCategory, width));
</script>

{#if svg}
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- markup built from escaped layout output -->
	<span class="fandom">{@html fandomSvgMarkup(svg, { label })}</span>
{/if}

<style>
	.fandom {
		display: block;
	}
	.fandom :global(svg) {
		display: block;
		overflow: visible;
	}
</style>
