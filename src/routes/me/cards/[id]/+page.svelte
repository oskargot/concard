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
	import type { CardView, PlacedSticker, ProfileLink } from '$lib/types';

	type PlacementPatch = Partial<Pick<PlacedSticker, 'x' | 'y' | 'rotation' | 'scale' | 'z_index'>>;

	let { data, form } = $props();

	const catalog = $derived(catalogFrom(data.stickers));
	const fandoms = $derived(fandomMap(data.fandoms));
	// protected route: the hook guarantees a profile here
	const profile = $derived(data.profile!);

	// ---- who you are (profile) and how this card looks (card); previewed live ----
	// Seeded once from the server; later invalidations must not clobber edits in progress.
	// svelte-ignore state_referenced_locally
	let displayName = $state(profile.display_name);
	// svelte-ignore state_referenced_locally
	let bio = $state(profile.bio);
	// svelte-ignore state_referenced_locally
	const existingLinks = readLinks(profile.links);
	let links = $state<ProfileLink[]>(
		existingLinks.length ? existingLinks.map((l) => ({ ...l })) : [{ label: '', url: '' }]
	);
	// svelte-ignore state_referenced_locally
	let style = $state<CardStyle>(normalizeStyle(data.card.style));
	// svelte-ignore state_referenced_locally
	let affiliation = $state<string>(data.card.affiliation ?? '');

	// Style and profile fields only persist on Save, while stickers and the photo
	// write straight through. Track what is still unsaved so the save bar can say
	// so, rather than letting an edit quietly disappear on navigate.
	const savedStyle = $derived(normalizeStyle(data.card.style));
	const savedLinks = $derived(readLinks(profile.links));
	const filledLinks = $derived(links.filter((l) => l.url.trim()));
	const dirty = $derived(
		displayName !== profile.display_name ||
			bio !== profile.bio ||
			affiliation !== (data.card.affiliation ?? '') ||
			style.frame !== savedStyle.frame ||
			style.bg !== savedStyle.bg ||
			style.shape !== savedStyle.shape ||
			style.photo_shape !== savedStyle.photo_shape ||
			filledLinks.length !== savedLinks.length ||
			filledLinks.some((l, i) => l.url !== savedLinks[i]?.url || l.label !== savedLinks[i]?.label)
	);

	// ---- stickers (saved directly through the browser client) ----
	// Server state, but locally reassignable so drags feel instant before the save lands.
	let placed = $derived<PlacedSticker[]>(data.placements.map(placementToPlaced));
	let selectedId = $state<string | null>(null);
	let stickerError = $state('');
	const selected = $derived(placed.find((p) => p.id === selectedId) ?? null);

	const view = $derived<CardView>({
		title: displayName || 'Your name',
		handle: profile.username,
		bio,
		art_url: data.card.art_url,
		style,
		affiliation: fandomToAffiliation(affiliation ? fandoms.get(affiliation) : null),
		links: links.filter((l) => l.url.trim()),
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

<a href="/me" class="text-sm text-dim hover:text-cream">← Your card</a>
<div class="mt-2 flex items-center justify-between gap-3">
	<h1 class="display text-2xl">Edit card</h1>
	{#if data.isActive}
		<span class="meta text-gold">On display</span>
	{:else}
		<form method="POST" action="?/setActive" use:enhance>
			<button class="btn-secondary !py-1.5 text-xs">Put on display</button>
		</form>
	{/if}
</div>

<!--
  The card stays put while the controls scroll under it. Every control here
  previews live, which is worth nothing if the card has scrolled off the top.
-->
<div class="sticky top-0 z-20 -mx-4 border-b border-line bg-ground px-4 pt-3 pb-3">
	<div class="mx-auto max-w-[228px]" bind:this={cardEl}>
		<Card
			{view}
			{catalog}
			editable
			{selectedId}
			onstickerdown={onStickerDown}
			onfacedown={onFaceDown}
		/>
	</div>

	{#if selected}
		<div class="mt-3 flex items-center justify-center gap-1.5">
			<button
				type="button"
				class="btn-secondary !px-2.5 !py-1.5"
				aria-label="Rotate left"
				onclick={() => nudge((p) => ({ rotation: p.rotation - 15 }))}>↺</button
			>
			<button
				type="button"
				class="btn-secondary !px-2.5 !py-1.5"
				aria-label="Rotate right"
				onclick={() => nudge((p) => ({ rotation: p.rotation + 15 }))}>↻</button
			>
			<button
				type="button"
				class="btn-secondary !px-2.5 !py-1.5"
				aria-label="Smaller"
				onclick={() => nudge((p) => ({ scale: clamp(round(p.scale - 0.15), 0.25, 3) }))}>−</button
			>
			<button
				type="button"
				class="btn-secondary !px-2.5 !py-1.5"
				aria-label="Bigger"
				onclick={() => nudge((p) => ({ scale: clamp(round(p.scale + 0.15), 0.25, 3) }))}>+</button
			>
			<button
				type="button"
				class="btn-danger !px-2.5 !py-1.5"
				aria-label="Remove sticker"
				onclick={removeSelected}>✕</button
			>
		</div>
	{:else}
		<p class="mt-3 text-center meta text-faint">Tap a sticker to pick it up</p>
	{/if}
</div>

<!--
  Look first: these are the controls that change the card most, so they sit
  closest to it. Their inputs belong to the save bar's form via form=, which
  lets the sticker and photo forms sit between them without nesting.
-->
<section class="mt-5 space-y-5 panel">
	<div>
		<h2 class="display text-lg">Look</h2>
		<p class="text-xs text-faint">Just this card.</p>
	</div>

	<fieldset>
		<legend class="mb-2 flex w-full items-baseline justify-between meta text-dim">
			<span>Frame</span>
			<span class="text-faint normal-case">{FRAME_LABEL[style.frame]}</span>
		</legend>
		<div class="grid grid-cols-4 gap-2">
			{#each FRAME_KEYS as key (key)}
				<label class="cursor-pointer">
					<input
						type="radio"
						form="card-save"
						name="frame"
						value={key}
						class="peer sr-only"
						bind:group={style.frame}
					/>
					<span
						class="swatch peer-checked:ring-2 peer-checked:ring-gold"
						style="background: {FRAMES[key]}"
						title={FRAME_LABEL[key]}
					></span>
				</label>
			{/each}
		</div>
	</fieldset>

	<fieldset>
		<legend class="mb-2 flex w-full items-baseline justify-between meta text-dim">
			<span>Background</span>
			<span class="text-faint normal-case">{BG_LABEL[style.bg]}</span>
		</legend>
		<div class="grid grid-cols-6 gap-2">
			{#each BG_KEYS as key (key)}
				<label class="cursor-pointer">
					<input
						type="radio"
						form="card-save"
						name="bg"
						value={key}
						class="peer sr-only"
						bind:group={style.bg}
					/>
					<span
						class="swatch peer-checked:ring-2 peer-checked:ring-gold"
						style="background: {BGS[key]}"
						title={BG_LABEL[key]}
					></span>
				</label>
			{/each}
		</div>
	</fieldset>

	<div class="grid grid-cols-2 gap-4">
		<fieldset>
			<legend class="mb-2 meta text-dim">Corners</legend>
			<div class="flex flex-wrap gap-1.5">
				{#each SHAPES as key (key)}
					<label class="cursor-pointer">
						<input
							type="radio"
							form="card-save"
							name="shape"
							value={key}
							class="peer sr-only"
							bind:group={style.shape}
						/>
						<span class="pill peer-checked:border-gold peer-checked:bg-gold/10"
							>{SHAPE_LABEL[key]}</span
						>
					</label>
				{/each}
			</div>
		</fieldset>
		<fieldset>
			<legend class="mb-2 meta text-dim">Photo shape</legend>
			<div class="flex flex-wrap gap-1.5">
				{#each PHOTO_SHAPES as key (key)}
					<label class="cursor-pointer">
						<input
							type="radio"
							form="card-save"
							name="photo_shape"
							value={key}
							class="peer sr-only"
							bind:group={style.photo_shape}
						/>
						<span class="pill peer-checked:border-gold peer-checked:bg-gold/10"
							>{PHOTO_SHAPE_LABEL[key]}</span
						>
					</label>
				{/each}
			</div>
		</fieldset>
	</div>

	<fieldset>
		<legend class="mb-2 meta text-dim">Fandom badge</legend>
		<div class="grid grid-cols-3 gap-2">
			<label class="cursor-pointer">
				<input
					type="radio"
					form="card-save"
					name="affiliation"
					value=""
					class="peer sr-only"
					bind:group={affiliation}
				/>
				<span class="fandom peer-checked:border-gold peer-checked:bg-gold/10">None</span>
			</label>
			{#each data.fandoms as f (f.id)}
				<label class="cursor-pointer">
					<input
						type="radio"
						form="card-save"
						name="affiliation"
						value={f.id}
						class="peer sr-only"
						bind:group={affiliation}
					/>
					<span class="fandom peer-checked:border-gold peer-checked:bg-gold/10">
						<span class="mark" style="background: linear-gradient(150deg, {f.color_a}, {f.color_b})"
							>{f.mark}</span
						>
						<span class="truncate">{f.name}</span>
					</span>
				</label>
			{/each}
		</div>
	</fieldset>
</section>

<!-- stickers: these write straight through, no save needed -->
<section class="mt-4 panel">
	<h2 class="display text-lg">Stickers</h2>
	<p class="mt-1 text-xs text-faint">
		Tap one to add it, then drag it anywhere on the card, even hanging off the edge. Anyone who
		collects this card gets a copy of one of them at random.
	</p>
	{#if stickerError}<p class="mt-2 text-sm text-ember" role="alert">{stickerError}</p>{/if}
	<ul class="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-6">
		{#each data.available as row (row.sticker_id)}
			{@const s = catalog.get(row.sticker_id)}
			<li>
				<button
					type="button"
					class="flex w-full flex-col items-center gap-1 rounded-lg border border-line bg-ground p-2 text-center transition hover:bg-raised disabled:opacity-40"
					disabled={row.available < 1}
					onclick={() => addSticker(row.sticker_id)}
					title={s ? `${s.name} · ${RARITY_LABEL[s.rarity]}` : row.sticker_id}
				>
					<span class="text-2xl leading-none"><StickerGlyph sticker={s} label={false} /></span>
					<span class="font-mono text-[10px] text-faint">{row.available}/{row.owned}</span>
				</button>
			</li>
		{/each}
	</ul>
	{#if data.available.length === 0}
		<p class="mt-2 text-sm text-faint">
			No stickers yet. Collect other people's cards to earn some.
		</p>
	{/if}
</section>

<!-- photo: uploads immediately -->
<section class="mt-4 panel">
	<h2 class="display text-lg">Photo</h2>
	<form
		method="POST"
		action="?/art"
		enctype="multipart/form-data"
		use:enhance
		class="mt-2 flex items-center gap-2"
	>
		<input class="block w-full text-sm text-dim" type="file" name="art" accept="image/*" required />
		<button class="btn-secondary">Upload</button>
	</form>
	{#if data.card.art_url}
		<form method="POST" action="?/removeArt" use:enhance class="mt-2">
			<button class="text-xs text-faint hover:text-cream">Remove current photo</button>
		</form>
	{/if}
</section>

<section class="mt-4 space-y-4 panel">
	<div>
		<h2 class="display text-lg">You</h2>
		<p class="text-xs text-faint">
			Shared by all your cards. @{profile.username} can't be changed.
		</p>
	</div>
	<div>
		<label class="label" for="display_name">Name</label>
		<input
			id="display_name"
			form="card-save"
			class="field"
			name="display_name"
			maxlength="40"
			required
			bind:value={displayName}
		/>
	</div>
	<div>
		<label class="label" for="bio">Bio</label>
		<textarea
			id="bio"
			form="card-save"
			class="field"
			name="bio"
			rows="3"
			maxlength="200"
			bind:value={bio}></textarea>
	</div>
	<fieldset>
		<legend class="label">Links</legend>
		<p class="mb-2 text-xs text-faint">
			The first three show on the card as chips; all of them are tappable under it. Up to 8.
		</p>
		<div class="space-y-2">
			{#each links as link, i (i)}
				<div class="flex gap-2">
					<input
						form="card-save"
						class="field !w-28"
						name="link_label"
						placeholder="Label"
						maxlength="30"
						bind:value={link.label}
					/>
					<input
						form="card-save"
						class="field flex-1"
						name="link_url"
						placeholder="https://…"
						inputmode="url"
						bind:value={link.url}
					/>
					<button
						type="button"
						class="btn-secondary !px-3"
						aria-label="Remove link"
						onclick={() => (links = links.filter((_, j) => j !== i))}>×</button
					>
				</div>
			{/each}
		</div>
		{#if links.length < 8}
			<button
				type="button"
				class="mt-2 btn-secondary"
				onclick={() => (links = [...links, { label: '', url: '' }])}
			>
				Add link
			</button>
		{/if}
	</fieldset>
</section>

<!--
  The save bar is the form: every field above joins it by id, so the sections
  can be ordered by what they do rather than by which action saves them. It
  rides above the nav so an unsaved change is never off screen.
-->
<form
	id="card-save"
	method="POST"
	action="?/save"
	use:enhance
	class="sticky bottom-20 z-20 mt-4"
	aria-label="Save card"
>
	{#if form?.error}
		<div class="bar border-ember/40">
			<p class="text-sm text-ember" role="alert">{form.error}</p>
			<button class="btn-primary">Save</button>
		</div>
	{:else if dirty}
		<div class="bar border-gold/40">
			<p class="text-sm text-dim">Unsaved changes</p>
			<button class="btn-primary">Save</button>
		</div>
	{:else if form?.saved}
		<div class="bar border-line">
			<p class="text-sm text-sage" role="status">Saved.</p>
		</div>
	{/if}
</form>

<form
	method="POST"
	action="?/delete"
	class="mt-8 text-center"
	use:enhance={({ cancel }) => {
		if (!confirm('Delete this card? People who collected it keep their copy.')) cancel();
	}}
>
	<button class="text-sm text-ember/80 hover:text-ember">Delete card</button>
</form>

<style>
	/*
	  Floats over the sections it scrolls past. On a ground this dark a drop
	  shadow alone does not read as elevation — it just looks like another panel
	  — so the bar blurs what is behind it, which is unambiguous.
	*/
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border-radius: 0.75rem;
		border-width: 1px;
		background: color-mix(in srgb, var(--color-ground) 82%, transparent);
		-webkit-backdrop-filter: blur(10px);
		backdrop-filter: blur(10px);
		padding: 0.75rem;
		box-shadow: 0 12px 32px rgb(0 0 0 / 0.6);
	}
	.swatch {
		display: block;
		aspect-ratio: 1;
		border-radius: 0.5rem;
		border: 1px solid var(--color-line);
	}
	.pill {
		display: block;
		border-radius: 0.5rem;
		border: 1px solid var(--color-line);
		background: var(--color-ground);
		padding: 0.4rem 0.6rem;
		font-size: 0.75rem;
		font-weight: 600;
	}
	.fandom {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
		border-radius: 0.5rem;
		border: 1px solid var(--color-line);
		background: var(--color-ground);
		padding: 0.4rem 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
	}
	.mark {
		flex: none;
		border-radius: 0.25rem;
		padding: 0.1rem 0.25rem;
		font-family: var(--font-mono);
		font-size: 0.5rem;
		font-weight: 700;
		color: #fff;
		text-shadow: 0 1px 1px rgb(0 0 0 / 0.35);
	}
</style>
