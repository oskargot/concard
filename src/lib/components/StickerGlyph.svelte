<script lang="ts">
	import type { Sticker } from '$lib/types';

	let { sticker, label = true }: { sticker: Sticker | undefined; label?: boolean } = $props();
</script>

{#if sticker?.image_url}
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
