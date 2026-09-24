<script lang="ts">
	import { enhance } from '$app/forms';
	import Card from '$lib/components/Card.svelte';
	import CardBack from '$lib/components/CardBack.svelte';
	import FlipCard from '$lib/components/FlipCard.svelte';
	import { cardToView, catalogFrom, fandomMap } from '$lib/card';
	import { normalizeStyle } from '$lib/card-style';
	import { foilForTier } from '$lib/app-card/tiers';

	let { data, form } = $props();

	const catalog = $derived(catalogFrom(data.stickers, data.fandoms));
	const fandoms = $derived(fandomMap(data.fandoms));
	const active = $derived(data.cards.find((c) => c.id === data.profile.active_card_id));
	const activeView = $derived(
		active ? cardToView(active, data.profile, data.placements, fandoms) : null
	);
	const prettyLink = $derived(data.link.replace(/^https?:\/\//, ''));

	let flipped = $state(false);
	let copied = $state(false);

	async function share() {
		const payload = { title: `${data.profile.display_name} on concard`, url: data.link };
		if (navigator.share) {
			try {
				await navigator.share(payload);
				return;
			} catch {
				/* user cancelled */
			}
		}
		await navigator.clipboard?.writeText(data.link);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

<svelte:head><title>Your card · concard</title></svelte:head>

<header class="flex items-start justify-between gap-4">
	<div>
		<h1 class="display text-2xl">{data.profile.display_name}</h1>
		<a class="text-sm text-dim hover:text-paper" href="/{data.profile.username}">{prettyLink}</a>
	</div>
	{#if active}<a href="/me/cards/{active.id}" class="btn-secondary">Edit card</a>{/if}
</header>

<section class="mt-6">
	{#if active && activeView}
		<div class="mx-auto max-w-[320px]">
			<FlipCard bind:flipped label={flipped ? 'Show card front' : 'Show QR code'}>
				{#snippet front(t)}<Card
						view={activeView}
						{catalog}
						foil={foilForTier(0)}
						rx={t.rx}
						ry={t.ry}
					/>{/snippet}
				{#snippet back(t)}
					<CardBack
						variant="qr"
						style={normalizeStyle(active.style)}
						qrValue={data.link}
						url={prettyLink}
						rx={t.rx}
						ry={t.ry}
					/>
				{/snippet}
			</FlipCard>
		</div>
		<p class="mt-3 text-center text-xs text-faint">
			Drag to tilt. Tap to {flipped ? 'see the front' : 'show your QR code'}.
		</p>
		<div class="mt-4 flex justify-center gap-2">
			<button class="btn-primary" type="button" onclick={() => (flipped = !flipped)}>
				{flipped ? 'Show card' : 'Show QR'}
			</button>
			<button class="btn-secondary" type="button" onclick={share}>
				{copied ? 'Link copied' : 'Share link'}
			</button>
		</div>
	{:else}
		<div class="panel text-center">
			<p class="text-lg font-bold">You don't have a card yet</p>
			<p class="mt-1 text-sm text-dim">Make one and it goes on display right away.</p>
			<form method="POST" action="?/newCard" use:enhance class="mt-4">
				<button class="btn-primary">Make my first card</button>
			</form>
			{#if form?.error}<p class="mt-3 text-sm text-ember" role="alert">{form.error}</p>{/if}
		</div>
	{/if}
</section>

<section class="mt-8 grid grid-cols-2 gap-3">
	<a href="/binder" class="panel">
		<div class="font-mono text-3xl font-bold tabular-nums">{data.stats.collected}</div>
		<div class="mt-1 meta text-faint">cards collected</div>
	</a>
	<div class="panel">
		<div class="font-mono text-3xl font-bold tabular-nums">{data.stats.collectors}</div>
		<div class="mt-1 meta text-faint">people have yours</div>
	</div>
</section>

{#if data.cards.length > 0}
	<section class="mt-8">
		<div class="flex items-center justify-between">
			<h2 class="text-lg font-bold">Your cards</h2>
			<form method="POST" action="?/newCard" use:enhance>
				<button class="btn-secondary">New card</button>
			</form>
		</div>
		{#if form?.error}<p class="mt-2 text-sm text-ember" role="alert">{form.error}</p>{/if}
		<ul class="mt-3 grid grid-cols-3 gap-4">
			{#each data.cards as card (card.id)}
				{@const isActive = card.id === data.profile.active_card_id}
				<li class="flex flex-col gap-2">
					<a href="/me/cards/{card.id}" class="block" aria-label="Edit this card">
						<Card
							view={cardToView(card, data.profile, isActive ? data.placements : [], fandoms)}
							{catalog}
							foil={foilForTier(0)}
							detail="thumb"
						/>
					</a>
					{#if isActive}
						<span class="text-center text-xs font-semibold text-holo">On display</span>
					{:else}
						<form method="POST" action="?/setActive" use:enhance>
							<input type="hidden" name="card_id" value={card.id} />
							<button class="btn-secondary w-full !py-1.5 text-xs">Display</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
		<p class="mt-2 text-xs text-faint">Stickers only show on the card that's on display.</p>
	</section>
{/if}

<form method="POST" action="/logout" class="mt-12 text-center">
	<button class="text-sm text-faint hover:text-paper">Sign out</button>
</form>
