<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>concard · trading cards for cons</title>
	<meta
		name="description"
		content="Make a trading card for yourself, show your QR code, collect everyone you meet at the con."
	/>
</svelte:head>

<section class="mt-10 text-center">
	<p class="text-xs font-bold tracking-[0.3em] text-amber-300 uppercase">concard</p>
	<h1 class="mt-3 text-4xl font-black tracking-tight">You are the card.</h1>
	<p class="mx-auto mt-3 max-w-sm text-white/70">
		Make a trading card for yourself. Flip it to show your QR code. Collect everyone you meet at the
		con, and pick up a sticker from each card you grab.
	</p>
	<div class="mt-6 flex justify-center gap-2">
		{#if data.session}
			<a class="btn-primary" href="/me">Your card</a>
			<a class="btn-secondary" href="/scan">Scan</a>
		{:else}
			<a class="btn-primary" href="/login">Make your card</a>
			<a class="btn-secondary" href="/login">Sign in</a>
		{/if}
	</div>
</section>

<section class="mt-12 grid gap-3">
	<div class="panel">
		<div class="text-2xl">◉</div>
		<h2 class="mt-1 font-bold">One code, many cards</h2>
		<p class="text-sm text-white/60">
			Your QR code never changes. Swap which card it shows whenever you like.
		</p>
	</div>
	<div class="panel">
		<div class="text-2xl">▣</div>
		<h2 class="mt-1 font-bold">Scan to trade</h2>
		<p class="text-sm text-white/60">
			Scan each other and you both walk away with a card. Print your code on a badge and let anyone
			grab it.
		</p>
	</div>
	<div class="panel">
		<div class="text-2xl">✨</div>
		<h2 class="mt-1 font-bold">Sticker drops</h2>
		<p class="text-sm text-white/60">
			Decorate your card with stickers. Everyone who collects it gets a copy of one at random.
		</p>
	</div>
</section>
