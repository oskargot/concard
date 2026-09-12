<script lang="ts">
	import type { CardView, PlacedSticker } from '$lib/types';
	import {
		BGS,
		BG_LABEL,
		FRAMES,
		FRAME_LABEL,
		PHOTO_SHAPE_LABEL,
		SHAPE_LABEL,
		stickerRotation
	} from '$lib/card-style';
	import type { StickerCatalog } from '$lib/card';
	import CardShell from './CardShell.svelte';
	import StickerGlyph from './StickerGlyph.svelte';
	import { fly } from 'svelte/transition';

	interface Props {
		view: CardView;
		catalog: StickerCatalog;
		/** Pointer tilt, in degrees; drives the light. */
		rx?: number;
		ry?: number;
		dragging?: boolean;
		/** When set, stickers become pointer targets and the selected one is outlined. */
		editable?: boolean;
		selectedId?: string | null;
		/** The fandom badge is placed like a sticker, so it can be picked up too. */
		badgeSelected?: boolean;
		onstickerdown?: (sticker: PlacedSticker, event: PointerEvent) => void;
		onbadgedown?: (event: PointerEvent) => void;
		onfacedown?: (event: PointerEvent) => void;
		/** Look controls, each stepped from right where it applies on the card. */
		onframestep?: (dir: 1 | -1) => void;
		onbgstep?: (dir: 1 | -1) => void;
		oncornersstep?: (dir: 1 | -1) => void;
		onphotoshapestep?: (dir: 1 | -1) => void;
		/** Zoom the photo in/out around its current pan point. */
		onzoomstep?: (dir: 1 | -1) => void;
		/** The photo has been dragged to a new pan point, 0..1 of the image. */
		onartpan?: (x: number, y: number) => void;
	}

	let {
		view,
		catalog,
		rx = 0,
		ry = 0,
		dragging = false,
		editable = false,
		selectedId = null,
		badgeSelected = false,
		onstickerdown,
		onbadgedown,
		onfacedown,
		onframestep,
		onbgstep,
		oncornersstep,
		onphotoshapestep,
		onzoomstep,
		onartpan
	}: Props = $props();

	const MAX_CHIPS = 3;
	const chips = $derived(view.links.slice(0, MAX_CHIPS));
	const more = $derived(Math.max(0, view.links.length - MAX_CHIPS));
	const stickers = $derived([...view.stickers].sort((a, b) => a.z_index - b.z_index));
	// While the badge is still sitting over the footer, the chips leave room for
	// it, the way the old flex row did. Moved anywhere else, they take the width.
	const badgeOverFooter = $derived(
		!!view.affiliation && view.affiliation.x > 0.62 && view.affiliation.y > 0.76
	);

	// ---- photo pan/zoom: drag directly on the photo to pan; the zoom buttons
	// beside its shape control scale it. Panning needs the image's natural size
	// to convert a pixel drag into the object-position fraction it changes. ----
	let imgEl: HTMLImageElement | undefined = $state();
	let imgNatural = $state<{ w: number; h: number } | null>(null);
	function onImgLoad() {
		imgNatural = imgEl ? { w: imgEl.naturalWidth, h: imgEl.naturalHeight } : null;
	}

	interface PhotoDrag {
		pointerId: number;
		startX: number;
		startY: number;
		startArtX: number;
		startArtY: number;
		overflowX: number;
		overflowY: number;
	}
	let photoDrag: PhotoDrag | null = null;
	const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

	function onPhotoPointerDown(e: PointerEvent) {
		if (!onartpan || !view.art_url || !imgNatural) return;
		e.stopPropagation();
		const el = e.currentTarget as HTMLElement;
		const rect = el.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return;
		const coverScale = Math.max(rect.width / imgNatural.w, rect.height / imgNatural.h);
		const effW = imgNatural.w * coverScale * view.art_scale;
		const effH = imgNatural.h * coverScale * view.art_scale;
		photoDrag = {
			pointerId: e.pointerId,
			startX: e.clientX,
			startY: e.clientY,
			startArtX: view.art_x,
			startArtY: view.art_y,
			overflowX: Math.max(1, effW - rect.width),
			overflowY: Math.max(1, effH - rect.height)
		};
		el.setPointerCapture?.(e.pointerId);
	}
	function onPhotoPointerMove(e: PointerEvent) {
		const d = photoDrag;
		if (!d || e.pointerId !== d.pointerId) return;
		const dx = e.clientX - d.startX;
		const dy = e.clientY - d.startY;
		onartpan?.(clamp01(d.startArtX - dx / d.overflowX), clamp01(d.startArtY - dy / d.overflowY));
	}
	function onPhotoPointerUp(e: PointerEvent) {
		if (photoDrag?.pointerId === e.pointerId) photoDrag = null;
	}
</script>

{#snippet stepper(
	name: string,
	label: string,
	dot: string | null,
	onprev: (() => void) | undefined,
	onnext: (() => void) | undefined
)}
	<div class="pill" role="presentation" onpointerdown={(e) => e.stopPropagation()}>
		<button type="button" class="arrow" aria-label="Previous {name}" onclick={onprev}>‹</button>
		<span class="val">
			{#key label}
				<span
					class="valinner"
					in:fly|local={{ x: 10, duration: 140 }}
					out:fly|local={{ x: -10, duration: 140 }}
				>
					{#if dot}<span class="dot" style="background: {dot}"></span>{/if}
					{label}
				</span>
			{/key}
		</span>
		<button type="button" class="arrow" aria-label="Next {name}" onclick={onnext}>›</button>
	</div>
{/snippet}

<CardShell style={view.style} fx {rx} {ry} {dragging} {editable} {onfacedown}>
	<div class="body photo-{view.style.photo_shape}">
		<header class="head">
			<div class="name">{view.title}</div>
			<div class="handle">@{view.handle}</div>
		</header>

		<div class="photo">
			<div
				class="photo-clip"
				role={editable ? 'presentation' : undefined}
				onpointerdown={editable ? onPhotoPointerDown : undefined}
				onpointermove={editable ? onPhotoPointerMove : undefined}
				onpointerup={editable ? onPhotoPointerUp : undefined}
				onpointercancel={editable ? onPhotoPointerUp : undefined}
			>
				{#if view.art_url}
					<img
						bind:this={imgEl}
						onload={onImgLoad}
						src={view.art_url}
						alt=""
						draggable="false"
						style="object-position: {view.art_x * 100}% {view.art_y *
							100}%; transform: scale({view.art_scale}); transform-origin: {view.art_x *
							100}% {view.art_y * 100}%;"
					/>
				{:else}
					<span class="lab">photo</span>
				{/if}
			</div>
			{#if editable && (onphotoshapestep || onzoomstep)}
				<div class="photo-controls" role="presentation" onpointerdown={(e) => e.stopPropagation()}>
					{#if view.art_url && onzoomstep}
						<button
							type="button"
							class="zoom-btn"
							aria-label="Zoom out"
							onclick={() => onzoomstep(-1)}>−</button
						>
					{/if}
					{@render stepper(
						'photo shape',
						PHOTO_SHAPE_LABEL[view.style.photo_shape],
						null,
						() => onphotoshapestep?.(-1),
						() => onphotoshapestep?.(1)
					)}
					{#if view.art_url && onzoomstep}
						<button
							type="button"
							class="zoom-btn"
							aria-label="Zoom in"
							onclick={() => onzoomstep(1)}>+</button
						>
					{/if}
				</div>
			{/if}
		</div>

		<div class="bio">{view.bio}</div>

		<footer class="foot">
			<div class="links" class:reserve={badgeOverFooter}>
				{#each chips as l, i (l.url + i)}
					<span class="chip">{l.label || l.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
				{/each}
				{#if more > 0}<span class="lab more">+{more} more</span>{/if}
			</div>
		</footer>
	</div>

	{#snippet overlay()}
		{#if editable && onframestep}
			<div class="anchor anchor-frame">
				{@render stepper(
					'frame',
					FRAME_LABEL[view.style.frame],
					FRAMES[view.style.frame],
					() => onframestep(-1),
					() => onframestep(1)
				)}
			</div>
		{/if}
		{#if editable && onbgstep}
			<div class="anchor anchor-bg">
				{@render stepper(
					'background',
					BG_LABEL[view.style.bg],
					BGS[view.style.bg],
					() => onbgstep(-1),
					() => onbgstep(1)
				)}
			</div>
		{/if}
		{#if editable && oncornersstep}
			<div class="anchor anchor-corners">
				{@render stepper(
					'corner style',
					SHAPE_LABEL[view.style.shape],
					null,
					() => oncornersstep(-1),
					() => oncornersstep(1)
				)}
			</div>
		{/if}
		{#if view.affiliation}
			{@const a = view.affiliation}
			<div
				class="badge-holder"
				class:selected={editable && badgeSelected}
				role={editable ? 'presentation' : undefined}
				style="left: {a.x * 100}%; top: {a.y * 100}%;"
				onpointerdown={editable && onbadgedown
					? (e) => {
							e.stopPropagation();
							onbadgedown(e);
						}
					: undefined}
			>
				<div
					class="badge"
					style="background: linear-gradient(150deg, {a.color_a}, {a.color_b})"
					title={a.name}
				>
					<span class="mark">{a.mark}</span>
					<span class="badge-name">{a.name}</span>
				</div>
			</div>
		{/if}
		{#each stickers as s (s.id ?? `${s.sticker_id}-${s.x}-${s.y}`)}
			<div
				class="sticker"
				class:selected={editable && s.id != null && s.id === selectedId}
				role={editable ? 'presentation' : undefined}
				style="left: {s.x * 100}%; top: {s.y * 100}%; z-index: {s.z_index + 1};
					transform: translate(-50%, -50%) rotate({s.rotation +
					stickerRotation(s.id ?? s.sticker_id)}deg) scale({s.scale});"
				onpointerdown={editable && onstickerdown
					? (e) => {
							e.stopPropagation();
							onstickerdown(s, e);
						}
					: undefined}
			>
				<div class="cut">
					<StickerGlyph sticker={catalog.get(s.sticker_id)} label={false} />
				</div>
			</div>
		{/each}
	{/snippet}
</CardShell>

<style>
	.body {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		gap: 3cqw;
		padding: 4.67cqw;
		color: var(--ink);
	}

	/* ruled header */
	.head {
		display: flex;
		flex-direction: column;
		gap: 1cqw;
		padding-bottom: 2cqw;
		border-bottom: var(--hair) solid var(--ink);
		min-width: 0;
	}
	.name {
		font:
			400 7.67cqw/1 Fredoka,
			system-ui,
			sans-serif;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.handle {
		font:
			700 max(3.17cqw, 7px) / 1.2 'Space Mono',
			ui-monospace,
			monospace;
		color: var(--mute);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* photo slot: `.photo` sizes and positions the slot; `.photo-clip` alone
	   clips to its shape, so pan/zoom controls anchored on `.photo` can hang
	   over the edge instead of being cut off with the image. */
	.photo {
		position: relative;
		flex: none;
		height: 47.33cqw;
	}
	.photo-clip {
		width: 100%;
		height: 100%;
		border-radius: 4.67cqw;
		overflow: hidden;
		display: grid;
		place-items: center;
		background: repeating-linear-gradient(135deg, var(--hatch-a) 0 7px, var(--hatch-b) 7px 14px);
	}
	.photo-clip img {
		display: block;
		width: 100%;
		height: 100%;
		/* Without this, a grid item's automatic minimum size lets an intrinsically
		   tall image ignore the 100% height above and lay out at its own aspect
		   ratio instead — object-fit: cover then has no real box to crop against,
		   so it just shows the image scaled to width from the top. This is the
		   actual cause of the "only half my photo shows" bug. */
		min-width: 0;
		min-height: 0;
		object-fit: cover;
	}
	:global(.editable) .photo-clip {
		touch-action: none;
	}
	:global(.editable) .photo-clip:has(img) {
		cursor: grab;
	}
	.photo-square .photo-clip {
		border-radius: 1.33cqw;
	}
	.photo-arch .photo-clip {
		border-radius: 31.33cqw 31.33cqw 4.67cqw 4.67cqw;
	}
	.photo-circle .photo {
		height: 49.33cqw;
		width: 49.33cqw;
		align-self: center;
	}
	.photo-circle .photo-clip {
		border-radius: 50%;
	}

	/* look controls, live only when editable: floating pills anchored right at
	   what they change, so the card stays put while its options step past. */
	.pill,
	.zoom-btn {
		pointer-events: auto;
	}
	.pill {
		display: flex;
		align-items: center;
		gap: 0.1rem;
		border-radius: 0.5rem;
		border: 1px solid var(--color-line);
		background: var(--color-surface);
		padding: 0.1rem;
		box-shadow: 0 3px 10px rgb(0 0 0 / 0.35);
		white-space: nowrap;
	}
	.arrow {
		flex: none;
		width: 1.15rem;
		height: 1.15rem;
		border-radius: 0.35rem;
		font-size: 0.75rem;
		line-height: 1;
		color: var(--color-dim);
	}
	.arrow:active {
		transform: scale(0.9);
		background: var(--color-raised);
	}
	.val {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 2.6rem;
		overflow: hidden;
		font-size: 0.5625rem;
		font-weight: 600;
		color: var(--color-paper);
		padding: 0 0.1rem;
	}
	.valinner {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}
	.dot {
		flex: none;
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 0.15rem;
		border: 1px solid var(--color-line);
	}
	.zoom-btn {
		flex: none;
		width: 1.25rem;
		height: 1.25rem;
		border-radius: 50%;
		border: 1px solid var(--color-line);
		background: var(--color-surface);
		color: var(--color-paper);
		font-size: 0.85rem;
		line-height: 1;
		box-shadow: 0 3px 10px rgb(0 0 0 / 0.35);
	}
	.zoom-btn:active {
		transform: scale(0.9);
	}
	.photo-controls {
		position: absolute;
		left: 50%;
		bottom: 0;
		transform: translate(-50%, 50%);
		display: flex;
		align-items: center;
		gap: 0.35rem;
		z-index: 3;
	}

	/* the frame/background/corners pills anchor to the whole card's own edges
	   (top-left, top-right, bottom-center), regardless of what's inside */
	.anchor {
		position: absolute;
		pointer-events: none;
		z-index: 7;
	}
	.anchor-frame {
		top: 0;
		left: 22%;
		transform: translate(-50%, -50%);
	}
	.anchor-bg {
		top: 0;
		left: 78%;
		transform: translate(-50%, -50%);
	}
	.anchor-corners {
		bottom: 0;
		left: 50%;
		transform: translate(-50%, 50%);
	}

	/* bio panel */
	.bio {
		flex: 1;
		min-height: 0;
		overflow: hidden;
		border-radius: 4.67cqw;
		padding: 2.67cqw 3cqw;
		background: var(--wash);
		border: var(--hair) solid color-mix(in srgb, var(--ink) 25%, transparent);
		font:
			400 max(3.83cqw, 8px) / 1.45 Archivo,
			system-ui,
			sans-serif;
		color: var(--body);
		overflow-wrap: anywhere;
	}

	/* footer */
	.foot {
		display: flex;
		align-items: flex-end;
		gap: 2cqw;
		margin-top: auto;
	}
	.links {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1.33cqw;
	}
	.links.reserve {
		padding-right: 22cqw;
	}
	.chip {
		max-width: 100%;
		border-radius: 3cqw;
		padding: 1.33cqw 2.67cqw;
		background: var(--wash);
		border: var(--hair) solid color-mix(in srgb, var(--ink) 25%, transparent);
		font:
			600 max(3.17cqw, 7px) / 1.2 Archivo,
			system-ui,
			sans-serif;
		color: var(--ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.lab {
		font:
			700 max(2.67cqw, 6.5px) / 1 'Space Mono',
			ui-monospace,
			monospace;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--mute);
	}
	.badge-holder {
		position: absolute;
		transform: translate(-50%, -50%);
		z-index: 0;
	}
	:global(.editable) .badge-holder {
		pointer-events: auto;
		cursor: grab;
	}
	.badge-holder.selected .badge {
		outline: 0.85cqw solid var(--ink, #17161b);
		outline-offset: 0.6cqw;
	}
	.badge {
		flex: none;
		width: 20cqw;
		height: 20cqw;
		border-radius: 4.67cqw;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1cqw;
		color: #fbf9f3;
		text-align: center;
		padding: 1cqw;
	}
	.mark {
		font:
			700 5cqw/1 'Space Mono',
			ui-monospace,
			monospace;
	}
	.badge-name {
		font:
			700 1.83cqw/1.1 'Space Mono',
			ui-monospace,
			monospace;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* miniatures (binder thumbnails): the pixel floors on chip and bio type would
	   overflow, so show name, photo and badge only */
	@container (max-width: 180px) {
		.bio,
		.links {
			display: none;
		}
		.photo {
			flex: 1;
			height: auto;
		}
		.photo-circle .photo {
			flex: none;
			height: 49.33cqw;
		}
	}

	@container (max-width: 110px) {
		.handle {
			display: none;
		}
	}

	/* die-cut stickers, outside the face clip: the image (or emoji glyph) with a
	   paper-white outline traced around its alpha, like a real vinyl sticker */
	.sticker {
		position: absolute;
		width: 15.33cqw;
		height: 15.33cqw;
		display: grid;
		place-items: center;
		transform-origin: center;
		--rim: #fbf9f3;
		--rim-w: 0.7cqw;
	}
	.cut {
		width: 100%;
		height: 100%;
		display: grid;
		place-items: center;
		font-size: 11cqw;
		line-height: 1;
		/* four hard shadows trace the paper rim around the alpha; a soft dark edge
		   keeps pale stickers legible on pale cards; the last one lifts it off the card */
		filter: drop-shadow(var(--rim-w) 0 0 var(--rim))
			drop-shadow(calc(-1 * var(--rim-w)) 0 0 var(--rim)) drop-shadow(0 var(--rim-w) 0 var(--rim))
			drop-shadow(0 calc(-1 * var(--rim-w)) 0 var(--rim))
			drop-shadow(0 0 0.25cqw rgb(23 22 27 / 0.45)) drop-shadow(0 1cqw 1.6cqw rgb(23 22 27 / 0.3));
	}
	.cut :global(img) {
		width: 86%;
		height: 86%;
		object-fit: contain;
	}
	:global(.editable) .sticker {
		pointer-events: auto;
		cursor: grab;
	}
	.sticker.selected {
		--rim: var(--ink, #17161b);
		--rim-w: 0.85cqw;
	}
</style>
