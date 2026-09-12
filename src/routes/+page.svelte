<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import CardBack from '$lib/components/CardBack.svelte';
	import FlipCard from '$lib/components/FlipCard.svelte';
	import { cardToView, catalogFrom, fandomMap, snapshotToView } from '$lib/card';
	import { normalizeStyle } from '$lib/card-style';
	import { DEMO_CARD, demoCatalog } from '$lib/demo-card';

	let { data } = $props();

	const signedIn = $derived(!!data.profile);
	const mine = $derived(data.mine);
	const view = $derived(
		mine
			? cardToView(mine.card, data.profile!, mine.placements, fandomMap(mine.fandoms))
			: DEMO_CARD
	);
	const catalog = $derived(signedIn ? catalogFrom(data.stickers) : demoCatalog());
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
	<p class="holo-text meta">concard</p>
	{#if signedIn}
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

{#if signedIn && !mine}
	<section class="mt-8 panel text-center">
		<p class="display text-lg">No card on display yet</p>
		<p class="mt-1 text-sm text-dim">Make one and it goes up right away.</p>
		<a href="/me" class="mt-4 btn-primary">Make your card</a>
	</section>
{:else}
	<section class="mt-8">
		<div class="mx-auto max-w-[300px]">
			<FlipCard bind:flipped label={flipped ? 'Show the card front' : 'Show the QR code'}>
				{#snippet front(t)}
					<Card {view} {catalog} rx={t.rx} ry={t.ry} dragging={t.dragging} />
				{/snippet}
				{#snippet back(t)}
					<CardBack
						variant="qr"
						{style}
						qrSvg={data.qr}
						url={data.link}
						rx={t.rx}
						ry={t.ry}
						dragging={t.dragging}
					/>
				{/snippet}
			</FlipCard>
		</div>
		<p class="mt-4 text-center meta text-faint">Drag to tilt · tap to flip</p>
	</section>
{/if}

<section class="mt-8 flex justify-center gap-2">
	{#if signedIn && !mine}
		<!-- the panel above already carries the make-a-card action; don't repeat it -->
		<a class="btn-secondary" href="/scan">Scan someone</a>
	{:else if signedIn}
		<a class="btn-primary" href="/scan">Scan someone</a>
		<a class="btn-secondary" href="/me">Your card</a>
	{:else}
		<a class="btn-primary" href="/login">Make your card</a>
		<a class="btn-secondary" href="/login">Sign in</a>
	{/if}
</section>

{#if signedIn}
	<section class="mt-12">
		<div class="flex items-baseline justify-between gap-3">
			<h2 class="display text-lg">Recently added</h2>
			{#if data.recent.length > 0}
				<a href="/binder" class="meta text-dim hover:text-paper">Binder →</a>
			{/if}
		</div>

		{#if data.recent.length === 0}
			<div class="mt-3 panel text-center">
				<p class="text-sm text-dim">
					Nothing collected yet. Scan someone's code and their card lands here.
				</p>
				<a href="/scan" class="mt-3 btn-secondary">Scan a code</a>
			</div>
		{:else}
			<ul class="mt-4 grid grid-cols-3 gap-4">
				{#each data.recent as c (c.id)}
					{@const snap = snapshotToView(c.card_snapshot)}
					<li>
						<a href="/binder/{c.id}" class="block" aria-label="{snap.title}'s card">
							<Card view={snap} {catalog} />
							<div class="mt-2 truncate text-center text-xs text-dim">
								{snap.owner.display_name}
							</div>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{:else}
	<section class="mt-14">
		<ol class="grid gap-6">
			{#each steps as step, i (step.title)}
				<li class="flex gap-4">
					<span class="font-mono text-sm font-bold text-holo tabular-nums">{i + 1}</span>
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
