<script lang="ts">
	import { bakedArt } from '$lib/card';
	import type { Sticker } from '$lib/types';

	let { sticker, label = true }: { sticker: Sticker | undefined; label?: boolean } = $props();

	// Baked stickers carry their own die cut, so they need no rim filter and no
	// live glyph — see scripts/bake-stickers.mjs. They fill their container; the
	// caller sizes that container to put the artwork where it wants it.
	const baked = $derived(bakedArt(sticker));
</script>

{#if baked}
	<img
		src={baked.src}
		alt={label ? sticker?.name : ''}
		class="block h-full w-full object-contain select-none"
		draggable="false"
	/>
{:else if sticker?.image_url}
	<img
		src={sticker.image_url}
		alt={label ? sticker.name : ''}
		class="block h-full w-full object-contain select-none"
		draggable="false"
	/>
{:else}
	<span
		class="block leading-none select-none"
		style="font-size: 1em"
		role="img"
		aria-label={label ? (sticker?.name ?? 'sticker') : undefined}>{sticker?.glyph ?? '❔'}</span
	>
{/if}
