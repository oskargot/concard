<script lang="ts">
	import { enhance } from '$app/forms';
	import Card from '$lib/components/Card.svelte';
	import CardBack from '$lib/components/CardBack.svelte';
	import FlipCard from '$lib/components/FlipCard.svelte';
	import StickerGlyph from '$lib/components/StickerGlyph.svelte';
	import { catalogFrom, snapshotToView } from '$lib/card';

	let { data } = $props();

	const catalog = $derived(catalogFrom(data.stickers));
	const snap = $derived(snapshotToView(data.collection.card_snapshot));
	const bonus = $derived(
		data.collection.bonus_sticker_id ? catalog.get(data.collection.bonus_sticker_id) : undefined
	);
	const when = $derived(new Date(data.collection.collected_at));
	const currentUsername = $derived(data.owner?.username ?? snap.owner.username);

	const record = $derived({
		collected: when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
		event: 'No event',
		note: data.mutual
			? `Traded with @${snap.owner.username}. They have your card too.`
			: `Collected from @${snap.owner.username}. One-way, so far.`
	});

	let flipped = $state(false);
</script>

<svelte:head><title>{snap.title} · concard</title></svelte:head>

<a href="/binder" class="text-sm text-dim hover:text-paper">← Binder</a>
<h1 class="mt-2 display text-2xl">{snap.title}</h1>
<p class="text-sm text-dim">
	from
	{#if data.owner}<a class="underline hover:text-paper" href="/{currentUsername}"
			>{data.owner.display_name}</a
		>
	{:else}{snap.owner.display_name} (account gone){/if}
</p>

<div class="mx-auto mt-6 max-w-[320px]">
	<FlipCard bind:flipped label={flipped ? 'Show card front' : "Show collector's record"}>
		{#snippet front(t)}<Card
				view={snap}
				{catalog}
				rx={t.rx}
				ry={t.ry}
				dragging={t.dragging}
			/>{/snippet}
		{#snippet back()}<CardBack variant="record" style={snap.style} {record} />{/snippet}
	</FlipCard>
</div>
<p class="mt-3 text-center text-xs text-faint">
	Drag to tilt, tap to flip. This is the card as it looked when you met.
</p>

{#if bonus}
	<p class="mt-4 flex items-center justify-center gap-2 text-sm text-dim">
		<span class="text-2xl leading-none"><StickerGlyph sticker={bonus} /></span>
		<span>This card gave you a <b>{bonus.name}</b> sticker.</span>
	</p>
{/if}

<form
	method="POST"
	action="?/discard"
	class="mt-10 text-center"
	use:enhance={({ cancel }) => {
		if (!confirm('Remove this card from your binder? You keep any sticker it gave you.')) cancel();
	}}
>
	<button class="text-sm text-ember/80 hover:text-ember">Remove from binder</button>
</form>
