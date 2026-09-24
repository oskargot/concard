<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Card from '$lib/components/Card.svelte';
	import StickerTile from '$lib/components/StickerTile.svelte';
	import {
		BIO_MAX,
		catalogFrom,
		fandomMap,
		fandomToAffiliation,
		FOIL_LABEL,
		placementToPlaced,
		RARITY_LABEL
	} from '$lib/card';
	import {
		ALIGNMENT_LABEL,
		ALIGNMENTS,
		ART_SCALE_RANGE,
		BADGE_HOME,
		BG_KEYS,
		BG_LABEL,
		BGS,
		FRAME_KEYS,
		FRAME_LABEL,
		FRAMES,
		normalizeStyle,
		PHOTO_SHAPE_LABEL,
		PHOTO_SHAPES,
		STICKER_SCALE_RANGE,
		STICKER_X_RANGE,
		STICKER_Y_RANGE,
		stickerRotation,
		type CardStyle
	} from '$lib/card-style';
	import { baseSizeOf, MAX_STICKERS_PER_CARD, STICKER_BASE_WIDTH } from '$lib/stickers/resolve';
	import {
		canAddLink,
		layoutFront,
		photoHeightStops,
		snapPhotoHeight
	} from '$lib/app-card/layout/front';
	import { displayHandle, LINK_HANDLE_MAX, MAX_LINKS, normalizeLinks } from '$lib/app-card/links';
	import { linkInfo } from '$lib/app-card/link-platforms';
	import { foilForTier } from '$lib/app-card/tiers';
	import { fitNotices } from '$lib/app-card/editor/fit-notices';
	import type { CardLink, CardView, PlacedSticker } from '$lib/types';

	type PlacementPatch = Partial<Pick<PlacedSticker, 'x' | 'y' | 'rotation' | 'scale' | 'z_index'>>;

	let { data, form } = $props();

	const catalog = $derived(catalogFrom(data.stickers, data.fandoms));
	const fandoms = $derived(fandomMap(data.fandoms));
	// protected route: the hook guarantees a profile here
	const profile = $derived(data.profile!);

	// ---- what this card says, and how it looks; previewed live ----
	// Each text field shows the card's own value, or the profile's it inherits
	// (null on the card); the server writes it back as null again whenever it
	// matches the profile — concard-app's inherit rule (use-card-editor.ts).
	// Seeded once from the server; later invalidations must not clobber edits in progress.
	// svelte-ignore state_referenced_locally
	const seed = {
		display_name: data.card.display_name ?? profile.display_name,
		pronouns: data.card.pronouns ?? profile.pronouns ?? '',
		bio: data.card.bio ?? profile.bio ?? '',
		links: normalizeLinks(data.card.links),
		style: normalizeStyle(data.card.style)
	};
	let displayName = $state(seed.display_name);
	let pronouns = $state(seed.pronouns);
	let bio = $state(seed.bio);
	let links = $state<CardLink[]>(
		seed.links.length ? seed.links.map((l) => ({ ...l })) : [{ url: '', handle: '' }]
	);
	let style = $state<CardStyle>({ ...seed.style });
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

	/** Rows with a url are links; a blank row is only a place to type. */
	const filledLinks = $derived(links.filter((l) => l.url.trim()));
	const linkCount = $derived(filledLinks.length);

	// Card fields only persist on Save, while stickers and the photo write
	// straight through. Track what is still unsaved so the save bar can say so,
	// rather than letting an edit quietly disappear on navigate.
	const dirty = $derived(
		displayName !== seed.display_name ||
			pronouns !== seed.pronouns ||
			bio !== seed.bio ||
			affiliation !== (data.card.affiliation ?? '') ||
			style.frame !== seed.style.frame ||
			style.bg !== seed.style.bg ||
			style.photo_shape !== seed.style.photo_shape ||
			style.alignment !== seed.style.alignment ||
			style.photo_height !== seed.style.photo_height ||
			badgeX !== Number(data.card.affiliation_x) ||
			badgeY !== Number(data.card.affiliation_y) ||
			artX !== Number(data.card.art_x) ||
			artY !== Number(data.card.art_y) ||
			artScale !== Number(data.card.art_scale) ||
			filledLinks.length !== seed.links.length ||
			filledLinks.some((l, i) => l.url !== seed.links[i]?.url || l.handle !== seed.links[i]?.handle)
	);

	// ---- stickers (saved directly through the browser client) ----
	// Server state, but locally reassignable so drags feel instant before the save lands.
	let placed = $derived<PlacedSticker[]>(data.placements.map(placementToPlaced));
	let selectedId = $state<string | null>(null);
	let badgeSelected = $state(false);
	let stickerError = $state('');
	const selected = $derived(placed.find((p) => p.id === selectedId) ?? null);

	// The affiliation is a placement once the schema has moved it there, and the
	// card draws that placement rather than the card's columns. While editing,
	// the badge being dragged (and the fandom just picked) is the truth, so the
	// placement is redrawn from them; the server keeps the two in step on save.
	const affiliationPlacement = $derived(placed.find((p) => p.is_affiliation));
	const stickersOnCard = $derived(placed.filter((p) => !p.is_affiliation));
	const view = $derived.by<CardView>(() => {
		const fandom = affiliation ? fandoms.get(affiliation) : null;
		const base = affiliationPlacement;
		return {
			title: displayName || 'Your name',
			handle: profile.username,
			pronouns: pronouns || null,
			bio,
			art_url: data.card.art_url,
			art_x: artX,
			art_y: artY,
			art_scale: artScale,
			style,
			affiliation: base ? null : fandomToAffiliation(fandom, badgeX, badgeY),
			links: filledLinks,
			stickers:
				base && fandom
					? [
							...stickersOnCard,
							{
								...base,
								sticker_id: `fandom-${fandom.id}`,
								kind: 'fandom',
								label: fandom.name,
								fandom_id: fandom.id,
								style_category: fandom.style_category,
								x: badgeX,
								y: badgeY
							}
						]
					: stickersOnCard
		};
	});
	/** The per-card cap counts everything but the free affiliation. */
	const full = $derived(stickersOnCard.length >= MAX_STICKERS_PER_CARD);

	let cardEl: HTMLDivElement | undefined = $state();
	type Drag =
		| { kind: 'sticker'; id: string; pointerId: number }
		| { kind: 'badge'; pointerId: number }
		| { kind: 'sticker-rotate'; id: string; pointerId: number }
		| { kind: 'sticker-resize'; id: string; pointerId: number };
	let drag: Drag | null = null;

	const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
	const round = (n: number) => Math.round(n * 10000) / 10000;

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
			// half the sticker's unscaled base size: its long edge (deco) or width
			const baseRadius = (r.width * baseSizeOf(p)) / 2;
			const scale = clamp(
				round(Math.hypot(e.clientX - cx, e.clientY - cy) / baseRadius),
				...STICKER_SCALE_RANGE
			);
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
	const stepZoom = (dir: 1 | -1) =>
		(artScale = clamp(round(artScale + dir * 0.15), ...ART_SCALE_RANGE));

	// ---- the photo / bio divider, as a stepper over the spec's stops ----
	const stops = $derived(photoHeightStops(linkCount));
	const photoHeight = $derived(snapPhotoHeight(style.photo_height, linkCount));
	function stepPhotoHeight(dir: 1 | -1) {
		const i = stops.indexOf(photoHeight);
		style.photo_height = stops[Math.min(stops.length - 1, Math.max(0, i + dir))];
	}

	// ---- what doesn't fit, said out loud (the app's fit notices) ----
	const notices = $derived(
		fitNotices(
			layoutFront({
				name: view.title,
				username: view.handle,
				pronouns: view.pronouns,
				bio: view.bio,
				linkHandles: filledLinks.map(displayHandle),
				photoShape: style.photo_shape,
				photoHeight: style.photo_height,
				alignment: style.alignment
			}),
			linkCount > 0
		)
	);

	// ---- links: paste a url, the handle fills itself in ----
	const hasDraftRow = $derived(links.some((l) => !l.url.trim()));
	const addable = $derived(!hasDraftRow && canAddLink(style.photo_height, linkCount));
	function onLinkUrl(i: number, url: string) {
		const before = links[i];
		const suggested = linkInfo(before.url)?.handle ?? '';
		// Keep a handle the user typed; follow the url while it's still the suggestion.
		const handle =
			!before.handle || before.handle === suggested ? (linkInfo(url)?.handle ?? '') : before.handle;
		links[i] = { url, handle: handle.slice(0, LINK_HANDLE_MAX) };
	}

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
		if (full) {
			stickerError = `A card holds ${MAX_STICKERS_PER_CARD} stickers at most. Take one off first.`;
			return;
		}
		const z = placed.reduce((m, p) => Math.max(m, p.z_index), 0) + 1;
		// Where the app's tap-to-place drops one: the centre, slightly high, at
		// the app's base size.
		const { data: row, error } = await data.supabase
			.from('sticker_placements')
			.insert({
				card_id: data.card.id,
				sticker_id: stickerId,
				foil,
				x: 0.5,
				y: 0.45,
				size: STICKER_BASE_WIDTH,
				z_index: z
			})
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
		if (error) stickerError = error.hint ?? error.message;
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
			onartpan={onArtPan}
			foil={foilForTier(0)}
		/>
	</div>

	<!-- the look, stepped in the panel below; these carry it into the save form -->
	<input type="hidden" form="card-save" name="frame" value={style.frame} />
	<input type="hidden" form="card-save" name="bg" value={style.bg} />
	<input type="hidden" form="card-save" name="photo_shape" value={style.photo_shape} />
	<input type="hidden" form="card-save" name="alignment" value={style.alignment} />
	<input type="hidden" form="card-save" name="photo_height" value={photoHeight} />
	<input type="hidden" form="card-save" name="links" value={JSON.stringify(filledLinks)} />
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
	{#each notices as n (n.key)}
		<p class="mt-1 text-center text-xs text-dim">{n.text}</p>
	{/each}
</div>

{#snippet stepper(name: string, label: string, dot: string | null, onstep: (dir: 1 | -1) => void)}
	<div class="step">
		<span class="label !mb-0">{name}</span>
		<div class="pill">
			<button type="button" class="arrow" aria-label="Previous {name}" onclick={() => onstep(-1)}
				>‹</button
			>
			<span class="val">
				{#if dot}<span class="dot" style="background: {dot}"></span>{/if}
				{label}
			</span>
			<button type="button" class="arrow" aria-label="Next {name}" onclick={() => onstep(1)}
				>›</button
			>
		</div>
	</div>
{/snippet}

<section class="mt-4 panel">
	<h2 class="display text-lg">Look</h2>
	<div class="mt-3 grid gap-2">
		{@render stepper('Edge', FRAME_LABEL[style.frame], FRAMES[style.frame], (d) => {
			style.frame = step(FRAME_KEYS, style.frame, d);
		})}
		{@render stepper('Face', BG_LABEL[style.bg], BGS[style.bg], (d) => {
			style.bg = step(BG_KEYS, style.bg, d);
		})}
		{@render stepper('Photo shape', PHOTO_SHAPE_LABEL[style.photo_shape], null, (d) => {
			style.photo_shape = step(PHOTO_SHAPES, style.photo_shape, d);
		})}
		{@render stepper('Alignment', ALIGNMENT_LABEL[style.alignment], null, (d) => {
			style.alignment = step(ALIGNMENTS, style.alignment, d);
		})}
		{@render stepper(
			'Photo height',
			`${stops.indexOf(photoHeight) + 1} of ${stops.length}`,
			null,
			stepPhotoHeight
		)}
		{#if data.card.art_url}
			{@render stepper('Zoom', `${Math.round(artScale * 100)}%`, null, stepZoom)}
		{/if}
	</div>
	<p class="mt-2 text-xs text-faint">
		A taller photo leaves the bio fewer lines. Links never shrink the photo.
	</p>
</section>

<!-- the badge is placed and dragged like a sticker, so it is picked the same way -->
<section class="mt-4 panel">
	<h2 class="display text-lg">Fandom</h2>
	<p class="mt-1 text-xs text-faint">
		Tap a fandom to put its sticker on the card, then drag it anywhere. It starts in the card's
		bottom-right corner.
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
	{#if full && !stickerError}
		<p class="mt-2 text-sm text-dim">
			This card holds {MAX_STICKERS_PER_CARD} stickers, the most it can. Take one off to add another.
		</p>
	{/if}
	<ul class="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-6">
		{#each data.available as row (`${row.sticker_id}-${row.foil}`)}
			{@const s = catalog.get(row.sticker_id)}
			<li class="flex flex-col items-center gap-1">
				<StickerTile
					sticker={s}
					foil={row.foil}
					disabled={row.available < 1 || full}
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
		<h2 class="display text-lg">On this card</h2>
		<p class="text-xs text-faint">
			Left as your profile's, a field follows your profile. @{profile.username} can't be changed.
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
		<label class="label" for="pronouns">Pronouns</label>
		<input
			id="pronouns"
			form="card-save"
			class="field"
			name="pronouns"
			maxlength="30"
			placeholder="they/them"
			bind:value={pronouns}
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
			maxlength={BIO_MAX}
			bind:value={bio}></textarea>
	</div>
	<fieldset>
		<legend class="label">Links</legend>
		<p class="mb-2 text-xs text-faint">
			Paste a link; its icon and handle fill themselves in. Up to {MAX_LINKS}, in two columns.
		</p>
		<div class="space-y-2">
			{#each links as link, i (i)}
				<div class="flex gap-2">
					<input
						class="field flex-1"
						placeholder="https://…"
						inputmode="url"
						aria-label="Link {i + 1}"
						value={link.url}
						oninput={(e) => onLinkUrl(i, e.currentTarget.value)}
					/>
					<input
						class="field !w-32"
						placeholder="handle"
						maxlength={LINK_HANDLE_MAX}
						aria-label="Handle {i + 1}"
						bind:value={link.handle}
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
		{#if links.length < MAX_LINKS}
			<button
				type="button"
				class="mt-2 btn-secondary"
				disabled={!addable}
				onclick={() => (links = [...links, { url: '', handle: '' }])}
			>
				Add link
			</button>
			{#if !addable && !hasDraftRow}
				<p class="mt-1 text-xs text-faint">
					Another link needs a new row, and the photo is using that space. Make the photo shorter to
					make room.
				</p>
			{/if}
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
			<p class="text-sm text-sage" role="status">{form.notice ?? 'Saved.'}</p>
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
	.step {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.pill {
		display: flex;
		align-items: center;
		gap: 0.1rem;
		border-radius: 0.5rem;
		border: 1px solid var(--color-line);
		background: var(--color-ground);
		padding: 0.1rem;
	}
	.arrow {
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 0.35rem;
		color: var(--color-dim);
	}
	.arrow:active {
		background: var(--color-raised);
	}
	.val {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		min-width: 6.5rem;
		font-size: 0.75rem;
		font-weight: 600;
	}
	.dot {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 0.2rem;
		border: 1px solid var(--color-line);
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
