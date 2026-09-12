<script lang="ts">
	import StickerGlyph from '$lib/components/StickerGlyph.svelte';
	import { catalogFrom, RARITY_LABEL } from '$lib/card';

	let { data } = $props();
	const catalog = $derived(catalogFrom(data.stickers));

	/**
	 * One tile per copy owned, duplicates included — a real sticker sheet, not
	 * a deduped list. Same shape the eventual "combine two into a holo" flow
	 * will act on.
	 */
	const tiles = $derived(
		data.inventory
			.filter((row) => row.quantity > 0)
			.map((row) => ({ row, sticker: catalog.get(row.sticker_id) }))
			.sort((a, b) => (a.sticker?.sort_order ?? 0) - (b.sticker?.sort_order ?? 0))
			.flatMap(({ row, sticker }) =>
				Array.from({ length: row.quantity }, (_, i) => ({ key: `${row.sticker_id}-${i}`, sticker }))
			)
	);
</script>

<svelte:head><title>Stickers · concard</title></svelte:head>

<h1 class="display text-2xl">Stickers</h1>
<p class="text-sm text-dim">
	{tiles.length} sticker{tiles.length === 1 ? '' : 's'} collected, duplicates and all.
</p>

{#if tiles.length === 0}
	<div class="mt-6 panel text-center">
		<p class="text-lg font-bold">Nothing here yet</p>
		<p class="mt-1 text-sm text-dim">Collect someone's card and a sticker drops into your hands.</p>
		<a href="/scan" class="mt-4 btn-primary">Scan a code</a>
	</div>
{:else}
	<ul class="mt-5 grid grid-cols-5 gap-3 sm:grid-cols-6">
		{#each tiles as t (t.key)}
			<li
				class="flex aspect-square items-center justify-center rounded-lg border border-line bg-surface p-2"
				title={t.sticker ? `${t.sticker.name} · ${RARITY_LABEL[t.sticker.rarity]}` : undefined}
			>
				<span class="h-full max-h-8 w-full max-w-8">
					<StickerGlyph sticker={t.sticker} label={false} />
				</span>
			</li>
		{/each}
	</ul>
	<p class="mt-4 text-center text-xs text-faint">
		Two of the same kind will soon combine into a holographic finish.
	</p>
{/if}
