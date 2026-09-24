<script lang="ts">
	/**
	 * Dev only: the web card drawing the same v4 collection snapshot the app's
	 * binder draws (`collect-v4.json`, a real `collect_card()` response printed
	 * by scripts/collect-fixture.mjs), for side-by-side sticker comparison.
	 * Sticker art comes from the app's fixture bakes via
	 * PUBLIC_STICKER_ASSET_BASE (see .env.example).
	 */
	import Card from '$lib/components/Card.svelte';
	import { snapshotToView } from '$lib/card';
	import type { StickerCatalog } from '$lib/card';
	import fixture from './collect-v4.json';

	const view = snapshotToView(fixture.card_snapshot);
	const catalog: StickerCatalog = new Map();
	let tilt = $state(0);
</script>

<svelte:head><title>Stickers · dev</title></svelte:head>

<h1 class="display text-xl">Sticker parity</h1>
<p class="text-xs text-faint">
	Dev only. The same v4 snapshot the app's binder draws: a glitter star, a holo heart, plain
	sparkles and the Sci-fi affiliation.
</p>

<section class="mx-auto mt-6 max-w-[266px]" data-shot="card">
	<Card {view} {catalog} foil="none" rx={0} ry={tilt} />
</section>

<div class="mt-4 flex justify-center gap-2 text-xs">
	<button class="btn-secondary" type="button" onclick={() => (tilt = 0)}>Rest</button>
	<button class="btn-secondary" type="button" onclick={() => (tilt = 8)}>Tilt</button>
</div>
