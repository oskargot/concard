<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import StickerTile from '$lib/components/StickerTile.svelte';
	import { catalogFrom, FOIL_LABEL, NEXT_FOIL, normalizeFoil, RARITY_LABEL } from '$lib/card';
	import type { StickerFoil } from '$lib/types';

	let { data } = $props();
	const catalog = $derived(catalogFrom(data.stickers));

	interface Tile {
		key: string;
		sticker_id: string;
		foil: StickerFoil;
		/** On one of the user's cards right now — combine_stickers() won't spend
		 *  it until it's taken off, so it can't be selected here either. */
		inUse: boolean;
	}

	/**
	 * One tile per copy owned, duplicates included — a real sticker sheet, not
	 * a deduped list. Tapping two spare tiles of the same sticker at the same
	 * tier offers to combine them into the next one up; copies currently
	 * decorating a card are shown but not selectable.
	 */
	const tiles = $derived(
		data.inventory
			.filter((row) => row.quantity > 0)
			.map((row) => ({ row, sticker: catalog.get(row.sticker_id) }))
			.sort((a, b) => (a.sticker?.sort_order ?? 0) - (b.sticker?.sort_order ?? 0))
			.flatMap(({ row }): Tile[] => {
				const foil = normalizeFoil(row.foil);
				const placed = data.placedCount[`${row.sticker_id}:${foil}`] ?? 0;
				const spare = Math.max(0, row.quantity - placed);
				return Array.from({ length: row.quantity }, (_, i) => ({
					key: `${row.sticker_id}-${foil}-${i}`,
					sticker_id: row.sticker_id,
					foil,
					inUse: i >= spare
				}));
			})
	);

	let selected = $state<Tile[]>([]);
	let combining = $state(false);
	let error = $state('');

	function toggle(tile: Tile) {
		if (tile.inUse) return;
		error = '';
		if (selected.some((t) => t.key === tile.key)) {
			selected = selected.filter((t) => t.key !== tile.key);
			return;
		}
		if (
			selected.length === 1 &&
			selected[0].sticker_id === tile.sticker_id &&
			selected[0].foil === tile.foil
		) {
			selected = [...selected, tile];
			return;
		}
		selected = [tile];
	}

	const pair = $derived(selected.length === 2 ? selected[0] : null);
	const nextFoil = $derived(pair ? NEXT_FOIL[pair.foil] : null);

	async function combine() {
		if (!pair || !nextFoil) return;
		combining = true;
		error = '';
		const { error: err } = await data.supabase.rpc('combine_stickers', {
			p_sticker_id: pair.sticker_id,
			p_foil: pair.foil
		});
		combining = false;
		if (err) {
			error = err.hint ?? err.message;
			return;
		}
		selected = [];
		await invalidateAll();
	}
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
			{@const sticker = catalog.get(t.sticker_id)}
			{@const isSelected = selected.some((s) => s.key === t.key)}
			<li>
				<StickerTile
					{sticker}
					foil={t.foil}
					selected={isSelected}
					disabled={combining || t.inUse}
					title={sticker
						? `${sticker.name} · ${RARITY_LABEL[sticker.rarity]}${t.foil !== 'none' ? ` · ${FOIL_LABEL[t.foil]}` : ''}${t.inUse ? ' · On a card' : ''}`
						: undefined}
					onclick={() => toggle(t)}
				/>
			</li>
		{/each}
	</ul>

	{#if error}<p class="mt-4 text-sm text-ember" role="alert">{error}</p>{/if}

	{#if pair}
		{@const sticker = catalog.get(pair.sticker_id)}
		<div class="mt-4 flex items-center justify-between gap-3 panel">
			{#if nextFoil}
				<p class="text-sm">
					Combine 2 {sticker?.name ?? pair.sticker_id} into
					<span class="font-semibold text-holo">{FOIL_LABEL[nextFoil]}</span>?
				</p>
				<button class="btn-primary shrink-0" disabled={combining} onclick={combine}>
					{combining ? 'Combining…' : 'Combine'}
				</button>
			{:else}
				<p class="text-sm text-dim">That sticker is already as shiny as it gets.</p>
				<button class="btn-secondary shrink-0" onclick={() => (selected = [])}>Clear</button>
			{/if}
		</div>
	{:else}
		<p class="mt-4 text-center text-xs text-faint">
			Tap two spare copies of the same sticker to combine them into glitter, then holo. A dimmed
			copy is on one of your cards — remove it there first.
		</p>
	{/if}
{/if}
