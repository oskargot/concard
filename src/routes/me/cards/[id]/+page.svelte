<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Card from '$lib/components/Card.svelte';
	import StickerTile from '$lib/components/StickerTile.svelte';
	import {
		catalogFrom,
		fandomMap,
		fandomToAffiliation,
		FOIL_LABEL,
		placementToPlaced,
		RARITY_LABEL,
		readLinks
	} from '$lib/card';
	import {
		ART_SCALE_RANGE,
		BADGE_HOME,
		BG_KEYS,
		FRAME_KEYS,
		normalizeStyle,
		PHOTO_SHAPES,
		SHAPES,
		stickerRotation,
		STICKER_X_RANGE,
		STICKER_Y_RANGE,
		type CardStyle
	} from '$lib/card-style';
	import type { CardView, PlacedSticker, ProfileLink } from '$lib/types';

	type PlacementPatch = Partial<Pick<PlacedSticker, 'x' | 'y' | 'rotation' | 'scale' | 'z_index'>>;

	let { data, form } = $props();

	const catalog = $derived(catalogFrom(data.stickers, data.fandoms));
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
	// svelte-ignore state_referenced_locally
	let badgeX = $state(Number(data.card.affiliation_x));
	// svelte-ignore state_referenced_locally
	let badgeY = $state(Number(data.card.affiliation_y));
	// svelte-ignore state_referenced_locally
	let artX = $state(Number(data.card.art_x));
	// svelte-ignore state_referenced_locally
	let artY = $state(Number(data.card.art_y));
	// svelte-ignore state_referenced_locally
	let artScale = $state(Number(data.card.art_scale));

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
			badgeX !== Number(data.card.affiliation_x) ||
			badgeY !== Number(data.card.affiliation_y) ||
			artX !== Number(data.card.art_x) ||
			artY !== Number(data.card.art_y) ||
			artScale !== Number(data.card.art_scale) ||
			filledLinks.length !== savedLinks.length ||
			filledLinks.some((l, i) => l.url !== savedLinks[i]?.url || l.label !== savedLinks[i]?.label)
	);

	// ---- stickers (saved directly through the browser client) ----
	// Server state, but locally reassignable so drags feel instant before the save lands.
	let placed = $derived<PlacedSticker[]>(data.placements.map(placementToPlaced));
	let selectedId = $state<string | null>(null);
	let badgeSelected = $state(false);
	let stickerError = $state('');
	const selected = $derived(placed.find((p) => p.id === selectedId) ?? null);

	const view = $derived<CardView>({
		title: displayName || 'Your name',
		handle: profile.username,
		bio,
		art_url: data.card.art_url,
		art_x: artX,
		art_y: artY,
		art_scale: artScale,
		style,
		affiliation: fandomToAffiliation(affiliation ? fandoms.get(affiliation) : null, badgeX, badgeY),
		links: links.filter((l) => l.url.trim()),
		stickers: placed
	});

	let cardEl: HTMLDivElement | undefined = $state();
	type Drag =
		| { kind: 'sticker'; id: string; pointerId: number }
		| { kind: 'badge'; pointerId: number }
		| { kind: 'sticker-rotate'; id: string; pointerId: number }
		| { kind: 'sticker-resize'; id: string; pointerId: number };
	let drag: Drag | null = null;

	const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
	const round = (n: number) => Math.round(n * 10000) / 10000;
	// The sticker's own unscaled box is 15.33cqw square (see Card.svelte); cqw
	// is 1% of the card's own width, which cardEl is sized to.
	const STICKER_BASE_RADIUS_FRAC = 0.1533 / 2;

	function relPos(e: PointerEvent) {
		const r = cardEl!.getBoundingClientRect();
		return {
			x: clamp((e.clientX - r.left) / r.width, STICKER_X_RANGE[0], STICKER_X_RANGE[1]),
			y: clamp((e.clientY - r.top) / r.height, STICKER_Y_RANGE[0], STICKER_Y_RANGE[1])
		};
	}

	/** The pointer's angle around a sticker's center, converted to the stored
	 *  rotation (which excludes the small per-sticker jitter Card.svelte adds). */
	function angleFor(id: string, cx: number, cy: number, px: number, py: number): number {
		const screenAngle = (Math.atan2(py - cy, px - cx) * 180) / Math.PI;
		const raw = screenAngle + 90 - stickerRotation(id);
		return ((((raw + 180) % 360) + 360) % 360) - 180;
	}

	function onStickerDown(s: PlacedSticker, e: PointerEvent) {
		if (!s.id) return;
		badgeSelected = false;
		selectedId = s.id;
		drag = { kind: 'sticker', id: s.id, pointerId: e.pointerId };
		(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
	}
	function onStickerHandleDown(s: PlacedSticker, handle: 'rotate' | 'resize', e: PointerEvent) {
		if (!s.id) return;
		badgeSelected = false;
		selectedId = s.id;
		drag = {
			kind: handle === 'rotate' ? 'sticker-rotate' : 'sticker-resize',
			id: s.id,
			pointerId: e.pointerId
		};
		(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
	}
	function onBadgeDown(e: PointerEvent) {
		selectedId = null;
		badgeSelected = true;
		drag = { kind: 'badge', pointerId: e.pointerId };
		(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
	}
	function onMove(e: PointerEvent) {
		const d = drag;
		if (!d || e.pointerId !== d.pointerId) return;
		if (d.kind === 'badge') {
			const { x, y } = relPos(e);
			badgeX = x;
			badgeY = y;
			return;
		}
		if (d.kind === 'sticker') {
			const { x, y } = relPos(e);
			placed = placed.map((p) => (p.id === d.id ? { ...p, x, y } : p));
			return;
		}
		// rotate/resize pivot around the sticker's own center, not the pointer's
		// raw position, so they need the sticker's current placement.
		const p = placed.find((q) => q.id === d.id);
		if (!p) return;
		const r = cardEl!.getBoundingClientRect();
		const cx = r.left + p.x * r.width;
		const cy = r.top + p.y * r.height;
		if (d.kind === 'sticker-rotate') {
			const rotation = angleFor(d.id, cx, cy, e.clientX, e.clientY);
			placed = placed.map((q) => (q.id === d.id ? { ...q, rotation } : q));
		} else {
			const baseRadius = r.width * STICKER_BASE_RADIUS_FRAC;
			const scale = clamp(round(Math.hypot(e.clientX - cx, e.clientY - cy) / baseRadius), 0.25, 3);
			placed = placed.map((q) => (q.id === d.id ? { ...q, scale } : q));
		}
	}
	async function onUp(e: PointerEvent) {
		const d = drag;
		if (!d || e.pointerId !== d.pointerId) return;
		drag = null;
		// The badge belongs to the card's look, so it rides along with Save
		// rather than writing through the way a sticker placement does.
		if (d.kind === 'badge') {
			badgeX = round(badgeX);
			badgeY = round(badgeY);
			return;
		}
		const p = placed.find((q) => q.id === d.id);
		if (!p) return;
		if (d.kind === 'sticker') await persist(d.id, { x: round(p.x), y: round(p.y) });
		else if (d.kind === 'sticker-rotate') await persist(d.id, { rotation: round(p.rotation) });
		else await persist(d.id, { scale: round(p.scale) });
	}
	function onFaceDown() {
		selectedId = null;
		badgeSelected = false;
	}

	/** Cycle a style option; the steppers wrap around at both ends. */
	function step<T>(values: readonly T[], current: T, dir: 1 | -1): T {
		const i = values.indexOf(current);
		return values[(i + dir + values.length) % values.length];
	}
	const stepFrame = (dir: 1 | -1) => (style.frame = step(FRAME_KEYS, style.frame, dir));
	const stepBg = (dir: 1 | -1) => (style.bg = step(BG_KEYS, style.bg, dir));
	const stepCorners = (dir: 1 | -1) => (style.shape = step(SHAPES, style.shape, dir));
	const stepPhotoShape = (dir: 1 | -1) =>
		(style.photo_shape = step(PHOTO_SHAPES, style.photo_shape, dir));
	const stepZoom = (dir: 1 | -1) =>
		(artScale = clamp(round(artScale + dir * 0.15), ...ART_SCALE_RANGE));
	function onArtPan(x: number, y: number) {
		artX = x;
		artY = y;
	}

	function pickFandom(id: string) {
		// Swapping which badge keeps where you put it; adding the first one drops
		// it in the spot the footer badge used to hold.
		if (!affiliation) {
			badgeX = BADGE_HOME.x;
			badgeY = BADGE_HOME.y;
		}
		affiliation = id;
		selectedId = null;
		badgeSelected = true;
	}

	async function persist(id: string, patch: PlacementPatch) {
		stickerError = '';
		const { error } = await data.supabase.from('sticker_placements').update(patch).eq('id', id);
		if (error) {
			stickerError = error.hint ?? error.message;
			await invalidateAll();
		}
	}

	async function addSticker(stickerId: string, foil: PlacedSticker['foil']) {
		stickerError = '';
		const z = placed.reduce((m, p) => Math.max(m, p.z_index), 0) + 1;
		const { data: row, error } = await data.supabase
			.from('sticker_placements')
			.insert({ card_id: data.card.id, sticker_id: stickerId, foil, x: 0.5, y: 0.5, z_index: z })
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
</script>

<svelte:head><title>Edit card · concard</title></svelte:head>

<svelte:window onpointermove={onMove} onpointerup={onUp} onpointercancel={onUp} />

<a href="/me" class="text-sm text-dim hover:text-paper">← Your card</a>
<div class="mt-2 flex items-center justify-between gap-3">
	<h1 class="display text-2xl">Edit card</h1>
	{#if data.isActive}
		<span class="meta text-holo">On display</span>
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
<div class="sticky top-0 z-20 -mx-4 border-b border-line bg-ground px-4 pt-4 pb-4">
	<div class="mx-auto max-w-[228px]" bind:this={cardEl}>
		<Card
			{view}
			{catalog}
			editable
			{selectedId}
			{badgeSelected}
			onstickerdown={onStickerDown}
			onstickerhandledown={onStickerHandleDown}
			onbadgedown={onBadgeDown}
			onfacedown={onFaceDown}
			onframestep={stepFrame}
			onbgstep={stepBg}
			oncornersstep={stepCorners}
			onphotoshapestep={stepPhotoShape}
			onzoomstep={stepZoom}
			onartpan={onArtPan}
		/>
	</div>

	<!--
	  Look and photo framing live on the card itself: pills at the frame,
	  background, corners and photo shape's own spot on the card, stepped with
	  their arrows, plus drag-to-pan and the zoom buttons on the photo. These
	  hidden inputs carry the current values into the save form below.
	-->
	<input type="hidden" form="card-save" name="frame" value={style.frame} />
	<input type="hidden" form="card-save" name="bg" value={style.bg} />
	<input type="hidden" form="card-save" name="shape" value={style.shape} />
	<input type="hidden" form="card-save" name="photo_shape" value={style.photo_shape} />
	<input type="hidden" form="card-save" name="art_x" value={artX} />
	<input type="hidden" form="card-save" name="art_y" value={artY} />
	<input type="hidden" form="card-save" name="art_scale" value={artScale} />

	{#if selected}
		<div class="mt-3 flex flex-col items-center gap-2">
			<p class="meta text-faint">Drag the dots to rotate or resize</p>
			<button type="button" class="btn-danger !px-2.5 !py-1.5" onclick={removeSelected}>
				✕ Remove sticker
			</button>
		</div>
	{:else if badgeSelected}
		<p class="mt-3 text-center meta text-faint">Drag the badge to move it</p>
	{:else}
		<p class="mt-3 text-center meta text-faint">
			Tap a sticker or badge to pick it up, or drag the photo to reframe it
		</p>
	{/if}
</div>

<!-- the badge is placed and dragged like a sticker, so it is picked the same way -->
<section class="mt-4 panel">
	<h2 class="display text-lg">Fandom</h2>
	<p class="mt-1 text-xs text-faint">
		Tap a badge to put it on the card, then drag it anywhere. It starts in the corner the badge has
		always sat in.
	</p>
	<input type="hidden" form="card-save" name="affiliation" value={affiliation} />
	<input type="hidden" form="card-save" name="affiliation_x" value={badgeX} />
	<input type="hidden" form="card-save" name="affiliation_y" value={badgeY} />
	<ul class="mt-3 grid grid-cols-3 gap-2">
		{#each data.fandoms as f (f.id)}
			<li>
				<button
					type="button"
					class="fandom"
					class:on={affiliation === f.id}
					aria-pressed={affiliation === f.id}
					onclick={() => pickFandom(f.id)}
				>
					<span class="mark" style="background: linear-gradient(150deg, {f.color_a}, {f.color_b})"
						>{f.mark}</span
					>
					<span class="truncate">{f.name}</span>
				</button>
			</li>
		{/each}
	</ul>
	{#if affiliation}
		<button
			type="button"
			class="mt-3 text-xs text-faint hover:text-paper"
			onclick={() => {
				affiliation = '';
				badgeSelected = false;
			}}>Take the badge off</button
		>
	{/if}
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
		{#each data.available as row (`${row.sticker_id}-${row.foil}`)}
			{@const s = catalog.get(row.sticker_id)}
			<li class="flex flex-col items-center gap-1">
				<StickerTile
					sticker={s}
					foil={row.foil}
					disabled={row.available < 1}
					onclick={() => addSticker(row.sticker_id, row.foil)}
					title={s
						? `${s.name} · ${RARITY_LABEL[s.rarity]}${row.foil !== 'none' ? ` · ${FOIL_LABEL[row.foil]}` : ''}`
						: row.sticker_id}
				/>
				<span class="font-mono text-[10px] text-faint">{row.available}/{row.owned}</span>
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
			<button class="text-xs text-faint hover:text-paper">Remove current photo</button>
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
		<div class="bar border-holo/40">
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
	.fandom {
		display: flex;
		width: 100%;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
		border-radius: 0.5rem;
		border: 1px solid var(--color-line);
		background: var(--color-ground);
		padding: 0.4rem 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		transition: background 0.12s ease;
	}
	.fandom:hover {
		background: var(--color-raised);
	}
	.fandom.on {
		border-color: var(--color-holo);
		background: color-mix(in srgb, var(--color-holo) 12%, transparent);
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
