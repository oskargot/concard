<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import { catalogFrom, snapshotToView } from '$lib/card';

	let { data } = $props();
	const catalog = $derived(catalogFrom(data.stickers));
</script>

<svelte:head><title>Binder · concard</title></svelte:head>

<h1 class="text-2xl font-black tracking-tight">Binder</h1>
<p class="text-sm text-white/60">
	{data.collections.length} card{data.collections.length === 1 ? '' : 's'} collected. Tap one to flip
	it over.
</p>

{#if data.collections.length === 0}
	<div class="mt-6 panel text-center">
		<p class="text-lg font-bold">Nothing here yet</p>
		<p class="mt-1 text-sm text-white/60">Scan someone's concard QR code to collect their card.</p>
		<a href="/scan" class="mt-4 btn-primary">Scan a code</a>
	</div>
{:else}
	<ul class="mt-5 grid grid-cols-3 gap-4">
		{#each data.collections as c (c.id)}
			{@const snap = snapshotToView(c.card_snapshot)}
			<li>
				<a
					href="/binder/{c.id}"
					class="block"
					aria-label="{snap.title} from {snap.owner.display_name}"
				>
					<Card view={snap} {catalog} />
					<div class="mt-2 truncate text-center text-xs text-white/70">
						{snap.owner.display_name}
					</div>
				</a>
			</li>
		{/each}
	</ul>
{/if}
