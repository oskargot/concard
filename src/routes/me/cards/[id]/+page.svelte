<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Card from '$lib/components/Card.svelte';
	import StickerGlyph from '$lib/components/StickerGlyph.svelte';
	import { catalogFrom, placementToPlaced, RARITY_LABEL, templateConfig } from '$lib/card';
	import type { CardColors, CardView, PlacedSticker } from '$lib/types';

	type PlacementPatch = Partial<Pick<PlacedSticker, 'x' | 'y' | 'rotation' | 'scale' | 'z_index'>>;

	let { data, form } = $props();

	const catalog = $derived(catalogFrom(data.stickers));

	// ---- text / template / colours (form-driven, previewed live) ----
	// Seeded once from the server; later invalidations must not clobber edits in progress.
	// svelte-ignore state_referenced_locally
	let title = $state(data.card.title);
	// svelte-ignore state_referenced_locally
	let subtitle = $state(data.card.subtitle);
	// svelte-ignore state_referenced_locally
	let flavor = $state(data.card.flavor_text);
	// svelte-ignore state_referenced_locally
	let templateId = $state(data.card.template_id);
	const template = $derived(data.templates.find((t) => t.id === templateId));
	// svelte-ignore state_referenced_locally
	const savedColors = (data.card.colors ?? {}) as CardColors;
	// svelte-ignore state_referenced_locally
	let colors = $state<Required<CardColors>>({
		...templateConfig(data.templates.find((t) => t.id === data.card.template_id)).defaultColors!,
		...savedColors
	});

	function applyTemplateDefaults() {
		colors = { ...templateConfig(template).defaultColors! };
	}

	// ---- stickers (saved directly through the browser client) ----
	// Server state, but locally reassignable so drags feel instant before the save lands.
	let placed = $derived<PlacedSticker[]>(data.placements.map(placementToPlaced));
	let selectedId = $state<string | null>(null);
	let stickerError = $state('');
	const selected = $derived(placed.find((p) => p.id === selectedId) ?? null);

	const view = $derived<CardView>({
		template_id: templateId,
		title: title || 'Untitled',
		subtitle,
		flavor_text: flavor,
		art_url: data.card.art_url,
		colors,
		stickers: placed
	});

	let cardEl: HTMLDivElement | undefined = $state();
	let drag: { id: string; pointerId: number } | null = null;

	function relPos(e: PointerEvent) {
		const r = cardEl!.getBoundingClientRect();
		return {
			x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
			y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
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
	const round = (n: number) => Math.round(n * 10000) / 10000;

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

	const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
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

<div class="mx-auto mt-4 max-w-[320px]" bind:this={cardEl}>
	<Card
		{view}
		{template}
		{catalog}
		editable
		{selectedId}
		onstickerdown={onStickerDown}
		onfacedown={onFaceDown}
	/>
</div>

<!-- stickers -->
<section class="mt-4 panel">
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
		Tap a sticker below to add it, then drag it around the card. Anyone who collects this card gets
		a copy of one random sticker from it.
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

<!-- art -->
<section class="mt-4 panel">
	<h2 class="font-bold">Art</h2>
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
			<button class="text-xs text-white/50 hover:text-white">Remove current art</button>
		</form>
	{/if}
</section>

<!-- text, template, colours -->
<form method="POST" action="?/save" use:enhance class="mt-4 space-y-4 panel">
	<div>
		<label class="label" for="title">Card name</label>
		<input id="title" class="field" name="title" maxlength="40" required bind:value={title} />
	</div>
	<div>
		<label class="label" for="subtitle">Type line</label>
		<input
			id="subtitle"
			class="field"
			name="subtitle"
			maxlength="60"
			placeholder="Cosplayer · Artist · Trekkie"
			bind:value={subtitle}
		/>
	</div>
	<div>
		<label class="label" for="flavor_text">Flavor text</label>
		<textarea
			id="flavor_text"
			class="field"
			name="flavor_text"
			rows="2"
			maxlength="200"
			bind:value={flavor}></textarea>
	</div>

	<fieldset>
		<legend class="label">Template</legend>
		<div class="grid grid-cols-4 gap-2">
			{#each data.templates as t (t.id)}
				<label class="cursor-pointer">
					<input
						type="radio"
						name="template_id"
						value={t.id}
						class="peer sr-only"
						bind:group={templateId}
						onchange={applyTemplateDefaults}
					/>
					<span
						class="block rounded-xl border border-white/10 bg-white/5 px-2 py-3 text-center text-xs font-semibold peer-checked:border-amber-400 peer-checked:bg-amber-400/10"
					>
						{t.name}
					</span>
				</label>
			{/each}
		</div>
		{#if template?.description}<p class="mt-1 text-xs text-white/50">{template.description}</p>{/if}
	</fieldset>

	<fieldset>
		<legend class="label">Colours</legend>
		<div class="grid grid-cols-3 gap-2">
			{#each ['primary', 'secondary', 'accent'] as const as key (key)}
				<label class="flex items-center gap-2 rounded-xl bg-white/5 p-2 text-xs capitalize">
					<input
						type="color"
						name={key}
						class="h-8 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
						bind:value={colors[key]}
					/>
					{key}
				</label>
			{/each}
		</div>
		<button
			type="button"
			class="mt-2 text-xs text-white/50 hover:text-white"
			onclick={applyTemplateDefaults}
		>
			Reset to template colours
		</button>
	</fieldset>

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
