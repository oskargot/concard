<script lang="ts">
	import { enhance } from '$app/forms';
	import Card from '$lib/components/Card.svelte';
	import CardBack from '$lib/components/CardBack.svelte';
	import FlipCard from '$lib/components/FlipCard.svelte';
	import { catalogFrom, snapshotToView } from '$lib/card';

	let { data } = $props();

	const catalog = $derived(catalogFrom(data.stickers));
	const snap = $derived(snapshotToView(data.collection.card_snapshot));
	const template = $derived(data.templates.find((t) => t.id === snap.template_id));
	const bonus = $derived(
		data.collection.bonus_sticker_id ? catalog.get(data.collection.bonus_sticker_id) : undefined
	);
	const when = $derived(new Date(data.collection.collected_at));
	const currentUsername = $derived(data.owner?.username ?? snap.owner.username);

	const notes = $derived([
		{ label: 'Collected from', value: `@${snap.owner.username}` },
		{
			label: 'When',
			value: when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
		},
		{ label: 'Event', value: 'No event' },
		{ label: 'Trade', value: data.mutual ? 'They have your card too' : 'One-way, so far' }
	]);

	let flipped = $state(false);
</script>

<svelte:head><title>{snap.title} · concard</title></svelte:head>

<a href="/binder" class="text-sm text-white/60 hover:text-white">← Binder</a>
<h1 class="mt-2 text-2xl font-black tracking-tight">{snap.title}</h1>
<p class="text-sm text-white/60">
	from
	{#if data.owner}<a class="underline hover:text-white" href="/{currentUsername}"
			>{data.owner.display_name}</a
		>
	{:else}{snap.owner.display_name} (account gone){/if}
</p>

<div class="mx-auto mt-4 max-w-[320px]">
	<FlipCard bind:flipped label={flipped ? 'Show card front' : 'Show collection notes'}>
		{#snippet front()}<Card view={snap} {template} {catalog} />{/snippet}
		{#snippet back()}
			<CardBack variant="notes" colors={snap.colors} {template} {notes} bonusSticker={bonus} />
		{/snippet}
	</FlipCard>
</div>
<p class="mt-3 text-center text-xs text-white/50">
	Tap to flip. This is the card as it looked when you met.
</p>

<form
	method="POST"
	action="?/discard"
	class="mt-10 text-center"
	use:enhance={({ cancel }) => {
		if (!confirm('Remove this card from your binder? You keep any sticker it gave you.')) cancel();
	}}
>
	<button class="text-sm text-rose-300/80 hover:text-rose-200">Remove from binder</button>
</form>
