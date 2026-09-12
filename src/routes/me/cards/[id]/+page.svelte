<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Card from '$lib/components/Card.svelte';
	import StickerGlyph from '$lib/components/StickerGlyph.svelte';
	import {
		catalogFrom,
		fandomMap,
		fandomToAffiliation,
		placementToPlaced,
		RARITY_LABEL,
		readLinks
	} from '$lib/card';
	import {
		BG_KEYS,
		BG_LABEL,
		BGS,
		FRAME_KEYS,
		FRAME_LABEL,
		FRAMES,
		normalizeStyle,
		PHOTO_SHAPE_LABEL,
		PHOTO_SHAPES,
		SHAPE_LABEL,
		SHAPES,
		STICKER_X_RANGE,
		STICKER_Y_RANGE,
		type CardStyle
	} from '$lib/card-style';
	import type { CardView, PlacedSticker } from '$lib/types';

	type PlacementPatch = Partial<Pick<PlacedSticker, 'x' | 'y' | 'rotation' | 'scale' | 'z_index'>>;

	let { data, form } = $props();

	const catalog = $derived(catalogFrom(data.stickers));
	const fandoms = $derived(fandomMap(data.fandoms));

	// ---- text / look (form-driven, previewed live) ----
	// Seeded once from the server; later invalidations must not clobber edits in progress.
	// svelte-ignore state_referenced_locally
	let title = $state(data.card.title);
	// svelte-ignore state_referenced_locally
	let bio = $state(data.card.bio);
	// svelte-ignore state_referenced_locally
	let style = $state<CardStyle>(normalizeStyle(data.card.style));
	// svelte-ignore state_referenced_locally
	let affiliation = $state<string>(data.card.affiliation ?? '');

	// ---- stickers (saved directly through the browser client) ----
	// Server state, but locally reassignable so drags feel instant before the save lands.
	let placed = $derived<PlacedSticker[]>(data.placements.map(placementToPlaced));
	let selectedId = $state<string | null>(null);
	let stickerError = $state('');
	const selected = $derived(placed.find((p) => p.id === selectedId) ?? null);

	const view = $derived<CardView>({
		title: title || 'Untitled',
		handle: data.profile!.username,
		bio,
		art_url: data.card.art_url,
		style,
		affiliation: fandomToAffiliation(affiliation ? fandoms.get(affiliation) : null),
		links: readLinks(data.profile!.links),
		stickers: placed
	});

	let cardEl: HTMLDivElement | undefined = $state();
	let drag: { id: string; pointerId: number } | null = null;

	const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
	const round = (n: number) => Math.round(n * 10000) / 10000;

	function relPos(e: PointerEvent) {
		const r = cardEl!.getBoundingClientRect();
		return {
			x: clamp((e.clientX - r.left) / r.width, STICKER_X_RANGE[0], STICKER_X_RANGE[1]),
			y: clamp((e.clientY - r.top) / r.height, STICKER_Y_RANGE[0], STICKER_Y_RANGE[1])
		};
	}

	function onStickerDown(s: PlacedSticker, e: PointerEvent) {
		if (!s.id) return;
		selectedId = s.id;
		drag = { id: s.id, pointerId: e.pointerId };
		(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
	}
	function onMove(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.pointerId) return;
		const { x, y } = relPos(e);
		placed = placed.map((p) => (p.id === drag!.id ? { ...p, x, y } : p));
	}
	async function onUp(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.pointerId) return;
		const id = drag.id;
		drag = null;
		const p = placed.find((q) => q.id === id);
		if (p) await persist(id, { x: round(p.x), y: round(p.y) });
	}
	function onFaceDown() {
		selectedId = null;
	}

	async function persist(id: string, patch: PlacementPatch) {
		stickerError = '';
		const { error } = await data.supabase.from('sticker_placements').update(patch).eq('id', id);
		if (error) {
			stickerError = error.hint ?? error.message;
			await invalidateAll();
		}
	}

	async function addSticker(stickerId: string) {
		stickerError = '';
		const z = placed.reduce((m, p) => Math.max(m, p.z_index), 0) + 1;
		const { data: row, error } = await data.supabase
			.from('sticker_placements')
			.insert({ card_id: data.card.id, sticker_id: stickerId, x: 0.5, y: 0.5, z_index: z })
			.select('*')
			.single();
		if (error || !row) {
			stickerError = error?.hint ?? error?.message ?? 'Could not place sticker';
			return;
		}
		selectedId = row.id;
		await invalidateAll();
	}

	async function removeSelected() {
		if (!selected?.id) return;
		const id = selected.id;
		selectedId = null;
		placed = placed.filter((p) => p.id !== id);
		const { error } = await data.supabase.from('sticker_placements').delete().eq('id', id);
		if (error) stickerError = error.message;
		await invalidateAll();
	}

	async function nudge(patch: (p: PlacedSticker) => PlacementPatch) {
		if (!selected?.id) return;
		const next = patch(selected);
		placed = placed.map((p) => (p.id === selected!.id ? { ...p, ...next } : p));
		await persist(selected.id, next);
	}
</script>

<svelte:head><title>Edit card · concard</title></svelte:head>

<svelte:window onpointermove={onMove} onpointerup={onUp} onpointercancel={onUp} />

<a href="/me" class="text-sm text-white/60 hover:text-white">← Your card</a>
<div class="mt-2 flex items-center justify-between">
	<h1 class="text-2xl font-black tracking-tight">Edit card</h1>
	{#if data.isActive}
		<span class="text-xs font-semibold text-amber-300">On display</span>
	{:else}
		<form method="POST" action="?/setActive" use:enhance>
			<button class="btn-secondary">Put on display</button>
		</form>
	{/if}
</div>

<div class="mx-auto mt-6 max-w-[300px]" bind:this={cardEl}>
	<Card
		{view}
		{catalog}
		editable
		{selectedId}
		onstickerdown={onStickerDown}
		onfacedown={onFaceDown}
	/>
</div>

<!-- stickers -->
<section class="mt-8 panel">
	<div class="flex items-center justify-between">
		<h2 class="font-bold">Stickers</h2>
		{#if selected}
			<div class="flex gap-1">
				<button
					type="button"
					class="btn-secondary !px-2.5"
					aria-label="Rotate left"
					onclick={() => nudge((p) => ({ rotation: p.rotation - 15 }))}>↺</button
				>
				<button
					type="button"
					class="btn-secondary !px-2.5"
					aria-label="Rotate right"
					onclick={() => nudge((p) => ({ rotation: p.rotation + 15 }))}>↻</button
				>
				<button
					type="button"
					class="btn-secondary !px-2.5"
					aria-label="Smaller"
					onclick={() => nudge((p) => ({ scale: clamp(round(p.scale - 0.15), 0.25, 3) }))}>−</button
				>
				<button
					type="button"
					class="btn-secondary !px-2.5"
					aria-label="Bigger"
					onclick={() => nudge((p) => ({ scale: clamp(round(p.scale + 0.15), 0.25, 3) }))}>+</button
				>
				<button
					type="button"
					class="btn-danger !px-2.5"
					aria-label="Remove sticker"
					onclick={removeSelected}>✕</button
				>
			</div>
		{/if}
	</div>
	<p class="mt-1 text-xs text-white/50">
		Tap a sticker below to add it, then drag it anywhere, even hanging off the edge. Anyone who
		collects this card gets a copy of one random sticker from it.
	</p>
	{#if stickerError}<p class="mt-2 text-sm text-rose-300" role="alert">{stickerError}</p>{/if}
	<ul class="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
		{#each data.available as row (row.sticker_id)}
			{@const s = catalog.get(row.sticker_id)}
			<li>
				<button
					type="button"
					class="flex w-full flex-col items-center gap-1 rounded-xl bg-white/5 p-2 text-center hover:bg-white/10 disabled:opacity-40"
					disabled={row.available < 1}
					onclick={() => addSticker(row.sticker_id)}
					title={s ? `${s.name} · ${RARITY_LABEL[s.rarity]}` : row.sticker_id}
				>
					<span class="text-3xl leading-none"><StickerGlyph sticker={s} label={false} /></span>
					<span class="text-[10px] text-white/60">{row.available}/{row.owned}</span>
				</button>
			</li>
		{/each}
	</ul>
	{#if data.available.length === 0}
		<p class="mt-2 text-sm text-white/50">
			No stickers yet. Collect other people's cards to earn some.
		</p>
	{/if}
</section>

<!-- photo -->
<section class="mt-4 panel">
	<h2 class="font-bold">Photo</h2>
	<form
		method="POST"
		action="?/art"
		enctype="multipart/form-data"
		use:enhance
		class="mt-2 flex items-center gap-2"
	>
		<input class="block w-full text-sm" type="file" name="art" accept="image/*" required />
		<button class="btn-secondary">Upload</button>
	</form>
	{#if data.card.art_url}
		<form method="POST" action="?/removeArt" use:enhance class="mt-2">
			<button class="text-xs text-white/50 hover:text-white">Remove current photo</button>
		</form>
	{/if}
</section>

<!-- text and look -->
<form method="POST" action="?/save" use:enhance class="mt-4 space-y-5 panel">
	<div>
		<label class="label" for="title">Name on the card</label>
		<input id="title" class="field" name="title" maxlength="40" required bind:value={title} />
	</div>
	<div>
		<label class="label" for="bio">Bio</label>
		<textarea id="bio" class="field" name="bio" rows="3" maxlength="200" bind:value={bio}
		></textarea>
	</div>

	<fieldset>
		<legend class="label">Frame</legend>
		<div class="grid grid-cols-4 gap-2">
			{#each FRAME_KEYS as key (key)}
				<label class="cursor-pointer">
					<input
						type="radio"
						name="frame"
						value={key}
						class="peer sr-only"
						bind:group={style.frame}
					/>
					<span
						class="swatch peer-checked:ring-2 peer-checked:ring-amber-400"
						style="background: {FRAMES[key]}"
					></span>
					<span class="swatch-label">{FRAME_LABEL[key]}</span>
				</label>
			{/each}
		</div>
	</fieldset>

	<fieldset>
		<legend class="label">Background</legend>
		<div class="grid grid-cols-6 gap-2">
			{#each BG_KEYS as key (key)}
				<label class="cursor-pointer">
					<input type="radio" name="bg" value={key} class="peer sr-only" bind:group={style.bg} />
					<span
						class="swatch peer-checked:ring-2 peer-checked:ring-amber-400"
						style="background: {BGS[key]}"
					></span>
					<span class="swatch-label">{BG_LABEL[key]}</span>
				</label>
			{/each}
		</div>
	</fieldset>

	<div class="grid grid-cols-2 gap-3">
		<fieldset>
			<legend class="label">Corners</legend>
			<div class="flex flex-col gap-1">
				{#each SHAPES as key (key)}
					<label class="option">
						<input
							type="radio"
							name="shape"
							value={key}
							class="peer sr-only"
							bind:group={style.shape}
						/>
						<span class="pill peer-checked:border-amber-400 peer-checked:bg-amber-400/10"
							>{SHAPE_LABEL[key]}</span
						>
					</label>
				{/each}
			</div>
		</fieldset>
		<fieldset>
			<legend class="label">Photo shape</legend>
			<div class="flex flex-col gap-1">
				{#each PHOTO_SHAPES as key (key)}
					<label class="option">
						<input
							type="radio"
							name="photo_shape"
							value={key}
							class="peer sr-only"
							bind:group={style.photo_shape}
						/>
						<span class="pill peer-checked:border-amber-400 peer-checked:bg-amber-400/10"
							>{PHOTO_SHAPE_LABEL[key]}</span
						>
					</label>
				{/each}
			</div>
		</fieldset>
	</div>

	<div>
		<label class="label" for="affiliation">Fandom badge</label>
		<select id="affiliation" class="field" name="affiliation" bind:value={affiliation}>
			<option value="">None</option>
			{#each data.fandoms as f (f.id)}
				<option value={f.id}>{f.name}</option>
			{/each}
		</select>
	</div>

	{#if form?.error}<p class="text-sm text-rose-300" role="alert">{form.error}</p>{/if}
	{#if form?.saved}<p class="text-sm text-emerald-300" role="status">Saved.</p>{/if}

	<button class="btn-primary w-full">Save card</button>
</form>

<form
	method="POST"
	action="?/delete"
	class="mt-8 text-center"
	use:enhance={({ cancel }) => {
		if (!confirm('Delete this card? People who collected it keep their copy.')) cancel();
	}}
>
	<button class="text-sm text-rose-300/80 hover:text-rose-200">Delete card</button>
</form>

<style>
	.swatch {
		display: block;
		aspect-ratio: 1;
		border-radius: 0.75rem;
		border: 1px solid rgb(255 255 255 / 0.15);
	}
	.swatch-label {
		display: block;
		margin-top: 0.25rem;
		text-align: center;
		font-size: 0.65rem;
		color: rgb(255 255 255 / 0.6);
	}
	.option {
		display: block;
		cursor: pointer;
	}
	.pill {
		display: block;
		border-radius: 0.75rem;
		border: 1px solid rgb(255 255 255 / 0.1);
		background: rgb(255 255 255 / 0.05);
		padding: 0.5rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 600;
	}
</style>
