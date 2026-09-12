<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import CardBack from '$lib/components/CardBack.svelte';
	import FlipCard from '$lib/components/FlipCard.svelte';
	import { cardToView, catalogFrom, fandomMap } from '$lib/card';
	import { normalizeStyle } from '$lib/card-style';
	import { DEMO_CARD, demoCatalog } from '$lib/demo-card';

	let { data } = $props();

	const mine = $derived(data.mine);
	const view = $derived(
		mine
			? cardToView(mine.card, data.profile!, mine.placements, fandomMap(mine.fandoms))
			: DEMO_CARD
	);
	const catalog = $derived(mine ? catalogFrom(mine.stickers) : demoCatalog());
	const style = $derived(mine ? normalizeStyle(mine.card.style) : DEMO_CARD.style);

	let flipped = $state(false);

	const steps = [
		{
			title: 'Make your card',
			body: 'Your name, your photo, your links, and whatever stickers you have picked up.'
		},
		{
			title: 'Wear your code',
			body: 'It is an ordinary link. Print it on your badge and any camera will open it — the other person does not need the app.'
		},
		{
			title: 'Collect each other',
			body: 'Scan, and you both keep a copy of the other card, frozen the way it looked that day.'
		}
	];
</script>

<svelte:head>
	<title>concard · trading cards for cons</title>
	<meta
		name="description"
		content="Make a trading card for yourself, show your QR code, collect everyone you meet at the con."
	/>
</svelte:head>

<section class="mt-8 text-center">
	<p class="meta text-gold">concard</p>
	{#if mine}
		<h1 class="mt-3 display text-[2.5rem] leading-[1.06] text-balance">
			{data.profile?.display_name}
		</h1>
		<p class="mt-1 font-mono text-sm text-dim">{data.link}</p>
	{:else}
		<h1 class="mt-3 display text-[2.5rem] leading-[1.06] text-balance">You are the card.</h1>
		<p class="mx-auto mt-3 max-w-xs text-[15px] leading-relaxed text-dim">
			Make one for yourself, put the code on your badge, and collect everyone you meet.
		</p>
	{/if}
</section>

<section class="mt-8">
	<div class="mx-auto max-w-[300px]">
		<FlipCard bind:flipped label={flipped ? 'Show the card front' : 'Show the QR code'}>
			{#snippet front(t)}
				<Card {view} {catalog} rx={t.rx} ry={t.ry} dragging={t.dragging} />
			{/snippet}
			{#snippet back()}
				<CardBack variant="qr" {style} qrSvg={data.qr} url={data.link} />
			{/snippet}
		</FlipCard>
	</div>
	<p class="mt-4 text-center meta text-faint">Drag to tilt · tap to flip</p>
</section>

<section class="mt-8 flex justify-center gap-2">
	{#if mine}
		<a class="btn-primary" href="/scan">Scan someone</a>
		<a class="btn-secondary" href="/me">Your card</a>
	{:else if data.session}
		<a class="btn-primary" href="/me">Make your card</a>
		<a class="btn-secondary" href="/scan">Scan someone</a>
	{:else}
		<a class="btn-primary" href="/login">Make your card</a>
		<a class="btn-secondary" href="/login">Sign in</a>
	{/if}
</section>

{#if !mine}
	<section class="mt-14">
		<ol class="grid gap-6">
			{#each steps as step, i (step.title)}
				<li class="flex gap-4">
					<span class="font-mono text-sm font-bold text-gold tabular-nums">{i + 1}</span>
					<div class="min-w-0">
						<h2 class="display text-lg">{step.title}</h2>
						<p class="mt-1 text-sm leading-relaxed text-dim">{step.body}</p>
					</div>
				</li>
			{/each}
		</ol>
	</section>

	<section class="mt-12 border-t border-line pt-6 text-center">
		<p class="mx-auto max-w-xs text-sm leading-relaxed text-dim">
			Every card you collect drops one of its stickers into your hands. Put them on your own and
			pass them along.
		</p>
	</section>
{/if}
