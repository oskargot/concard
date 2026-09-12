<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Card from '$lib/components/Card.svelte';
	import FlipCard from '$lib/components/FlipCard.svelte';
	import StickerGlyph from '$lib/components/StickerGlyph.svelte';
	import { cardToView, catalogFrom, fandomMap, readLinks } from '$lib/card';
	import { formatRetryIn } from '$lib/collect';

	let { data, form } = $props();

	const catalog = $derived(catalogFrom(data.stickers));
	const view = $derived(
		data.card ? cardToView(data.card, data.profile, data.placements, fandomMap(data.fandoms)) : null
	);
	const links = $derived(readLinks(data.profile.links));
	const bonus = $derived(form?.bonusStickerId ? catalog.get(form.bonusStickerId) : undefined);

	const retryAt = $derived(form?.retryAt ?? data.cooldownUntil);
	const canCollect = $derived(
		!!data.session && !data.isOwner && !!data.card && !retryAt && !form?.collected
	);

	let busy = $state(false);
	let collectForm: HTMLFormElement | undefined = $state();

	const loginHref = $derived(
		`/login?next=${encodeURIComponent(`/${data.profile.username}?collect=1`)}`
	);

	// Coming back from sign-in with ?collect=1: finish what they started.
	onMount(() => {
		if (page.url.searchParams.get('collect') === '1' && canCollect) collectForm?.requestSubmit();
	});

	const description = $derived(
		data.profile.bio || `${data.profile.display_name}'s trading card on concard.`
	);
</script>

<svelte:head>
	<title>{data.profile.display_name} · concard</title>
	<meta name="description" content={description} />
	<meta property="og:title" content="{data.profile.display_name} on concard" />
	<meta property="og:description" content={description} />
	{#if data.card?.art_url}<meta property="og:image" content={data.card.art_url} />{/if}
</svelte:head>

<section class="mx-auto mt-2 max-w-[320px]">
	{#if view}
		<FlipCard canFlip={false}>
			{#snippet front(t)}<Card
					{view}
					{catalog}
					rx={t.rx}
					ry={t.ry}
					dragging={t.dragging}
				/>{/snippet}
		</FlipCard>
	{:else}
		<div class="panel text-center text-dim">No card on display yet.</div>
	{/if}
</section>

<section class="mt-5">
	{#if form?.collected}
		<div class="panel border-sage/30 bg-sage/10 text-center">
			<p class="text-lg font-bold">Collected!</p>
			{#if bonus}
				<p class="mt-2 flex items-center justify-center gap-2 text-sm">
					<span class="text-3xl leading-none"><StickerGlyph sticker={bonus} /></span>
					<span>Bonus sticker: <b>{bonus.name}</b></span>
				</p>
			{:else}
				<p class="mt-1 text-sm text-dim">No stickers on this card, so no bonus this time.</p>
			{/if}
			<div class="mt-3 flex justify-center gap-2">
				<a class="btn-primary" href="/binder/{form.collectionId}">See it in your binder</a>
				<a class="btn-secondary" href="/me">Show my QR</a>
			</div>
		</div>
	{:else if data.isOwner}
		<div class="panel text-center">
			<p class="text-sm text-dim">
				This is your public card. Anyone who scans your code lands here.
			</p>
			<a class="mt-3 btn-secondary" href="/me">Back to your card</a>
		</div>
	{:else if !data.session}
		<a class="btn-primary w-full" href={loginHref}>Sign in to collect this card</a>
		<p class="mt-2 text-center text-xs text-faint">
			New here? You'll make your own card in about a minute.
		</p>
	{:else if retryAt}
		<div class="panel text-center">
			<p class="font-semibold">You already have this card</p>
			<p class="mt-1 text-sm text-dim">
				You can collect {data.profile.display_name} again in {formatRetryIn(retryAt)}.
			</p>
			<a class="mt-3 btn-secondary" href="/binder">Open binder</a>
		</div>
	{:else if data.card}
		<form
			method="POST"
			action="?/collect"
			bind:this={collectForm}
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update({ reset: false });
					busy = false;
				};
			}}
		>
			<button class="btn-primary w-full" disabled={busy}>
				{busy ? 'Collecting…' : `Collect ${data.profile.display_name}'s card`}
			</button>
		</form>
		{#if form?.hint}<p class="mt-2 text-center text-sm text-ember" role="alert">
				{form.hint}
			</p>{/if}
	{/if}

	{#if data.theyHaveMine && !data.isOwner}
		<p class="mt-3 text-center text-xs text-holo">
			{data.profile.display_name} already has your card.
		</p>
	{/if}
</section>

{#if links.length}
	<section class="mt-8">
		<h2 class="label">Links</h2>
		<ul class="space-y-2">
			{#each links as l (l.url)}
				<li>
					<a
						href={l.url}
						target="_blank"
						rel="noopener noreferrer me"
						class="flex items-center justify-between rounded-xl bg-surface px-4 py-3 text-sm font-semibold hover:bg-surface"
					>
						<span>{l.label}</span>
						<span class="text-faint">↗</span>
					</a>
				</li>
			{/each}
		</ul>
	</section>
{/if}

{#if !data.session}
	<p class="mt-10 text-center text-xs text-faint">
		<a href="/" class="underline">concard</a> · trading cards for cons and events
	</p>
{/if}
