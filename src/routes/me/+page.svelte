<script lang="ts">
	import { enhance } from '$app/forms';
	import Card from '$lib/components/Card.svelte';
	import CardBack from '$lib/components/CardBack.svelte';
	import FlipCard from '$lib/components/FlipCard.svelte';
	import { cardToView, catalogFrom } from '$lib/card';
	import type { CardColors } from '$lib/types';

	let { data, form } = $props();

	const catalog = $derived(catalogFrom(data.stickers));
	const active = $derived(data.cards.find((c) => c.id === data.profile.active_card_id));
	const activeView = $derived(active ? cardToView(active, data.placements) : null);
	const template = $derived(data.templates.find((t) => t.id === active?.template_id));

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
		<h1 class="text-2xl font-black tracking-tight">{data.profile.display_name}</h1>
		<a class="text-sm text-white/60 hover:text-white" href="/{data.profile.username}"
			>concard.me/{data.profile.username}</a
		>
	</div>
	<a href="/me/edit" class="btn-secondary">Edit profile</a>
</header>

<section class="mt-6">
	{#if active && activeView}
		<div class="mx-auto max-w-[320px]">
			<FlipCard bind:flipped label={flipped ? 'Show card front' : 'Show QR code'}>
				{#snippet front()}<Card view={activeView} {template} {catalog} />{/snippet}
				{#snippet back()}
					<CardBack
						variant="qr"
						colors={(active.colors ?? {}) as CardColors}
						{template}
						qrSvg={data.qr}
						username={data.profile.username}
					/>
				{/snippet}
			</FlipCard>
		</div>
		<p class="mt-3 text-center text-xs text-white/50">
			Tap the card to {flipped ? 'see the front' : 'show your QR code'}
		</p>
		<div class="mt-4 flex justify-center gap-2">
			<button class="btn-primary" type="button" onclick={() => (flipped = !flipped)}>
				{flipped ? 'Show card' : 'Show QR'}
			</button>
			<button class="btn-secondary" type="button" onclick={share}>
				{copied ? 'Link copied' : 'Share link'}
			</button>
			<a class="btn-secondary" href="/me/cards/{active.id}">Edit card</a>
		</div>
	{:else}
		<div class="panel text-center">
			<p class="text-lg font-bold">You don't have a card yet</p>
			<p class="mt-1 text-sm text-white/60">Make one and it goes on display right away.</p>
			<form method="POST" action="?/newCard" use:enhance class="mt-4">
				<button class="btn-primary">Make my first card</button>
			</form>
		</div>
	{/if}
</section>

<section class="mt-8 grid grid-cols-2 gap-3">
	<a href="/binder" class="panel">
		<div class="text-3xl font-black">{data.stats.collected}</div>
		<div class="text-xs tracking-wide text-white/60 uppercase">cards collected</div>
	</a>
	<div class="panel">
		<div class="text-3xl font-black">{data.stats.collectors}</div>
		<div class="text-xs tracking-wide text-white/60 uppercase">people have yours</div>
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
		{#if form?.error}<p class="mt-2 text-sm text-rose-300" role="alert">{form.error}</p>{/if}
		<ul class="mt-3 grid grid-cols-3 gap-3">
			{#each data.cards as card (card.id)}
				{@const isActive = card.id === data.profile.active_card_id}
				<li class="flex flex-col gap-2">
					<a href="/me/cards/{card.id}" class="block" aria-label="Edit {card.title}">
						<Card
							view={cardToView(card, isActive ? data.placements : [])}
							template={data.templates.find((t) => t.id === card.template_id)}
							{catalog}
						/>
					</a>
					{#if isActive}
						<span class="text-center text-xs font-semibold text-amber-300">On display</span>
					{:else}
						<form method="POST" action="?/setActive" use:enhance>
							<input type="hidden" name="card_id" value={card.id} />
							<button class="btn-secondary w-full !py-1.5 text-xs">Display</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
		<p class="mt-2 text-xs text-white/40">Stickers only show on the card that's on display.</p>
	</section>
{/if}

<form method="POST" action="/logout" class="mt-12 text-center">
	<button class="text-sm text-white/50 hover:text-white">Sign out</button>
</form>
