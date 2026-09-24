<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import { catalogFrom, meetingsByOwner, snapshotToView } from '$lib/card';
	import { foilForTier, tierForMeetings } from '$lib/app-card/tiers';

	let { data } = $props();
	const catalog = $derived(catalogFrom(data.stickers));
	// Meeting someone again upgrades their card in your binder (design bible §7).
	const meetings = $derived(meetingsByOwner(data.collections));
</script>

<svelte:head><title>Binder · concard</title></svelte:head>

<h1 class="display text-2xl">Binder</h1>
<p class="text-sm text-dim">
	{data.collections.length} card{data.collections.length === 1 ? '' : 's'} collected. Tap one to flip
	it over.
</p>

{#if data.collections.length === 0}
	<div class="mt-6 panel text-center">
		<p class="text-lg font-bold">Nothing here yet</p>
		<p class="mt-1 text-sm text-dim">Scan someone's concard QR code to collect their card.</p>
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
					<Card
						view={snap}
						{catalog}
						foil={foilForTier(tierForMeetings(meetings.get(c.owner_id) ?? 1))}
						detail="thumb"
					/>
					<div class="mt-2 truncate text-center text-xs text-dim">
						{snap.owner.display_name}
					</div>
				</a>
			</li>
		{/each}
	</ul>
{/if}
