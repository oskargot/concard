<script lang="ts">
	/**
	 * A link pill's platform icon, tinted to whatever it sits on — concard-app's
	 * `LinkIcon.tsx`, from the same synced icon table and domain rules. Simple
	 * Icons are filled 24 × 24 paths; the globe for an unknown domain is a
	 * 2-unit stroke in the same box.
	 */
	import { LINK_ICONS } from '$lib/app-card/link-icons';
	import { GLOBE_PATHS, iconFor } from '$lib/app-card/link-platforms';

	let { url, color }: { url: string; color: string } = $props();

	const icon = $derived(LINK_ICONS[iconFor(url)]);
</script>

<svg width="100%" height="100%" viewBox="0 0 24 24" aria-hidden="true">
	{#if icon}
		<path d={icon.path} fill={color} />
	{:else}
		{#each GLOBE_PATHS as d (d)}
			<path
				{d}
				fill="none"
				stroke={color}
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		{/each}
	{/if}
</svg>

<style>
	svg {
		display: block;
		overflow: hidden;
	}
</style>
