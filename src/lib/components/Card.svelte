<script lang="ts">
	/**
	 * One component draws a live card or a frozen snapshot, exactly as
	 * concard-app's `Card.tsx` / `CardFace.tsx` do: nothing here decides a size
	 * or a line break. `layoutFront` — synced verbatim from the app — returns
	 * every rectangle in design units and every string already ellipsised or
	 * wrapped, measured from Outfit's real metrics; this file only positions
	 * them at `--u` (width / 250) per unit, one element per line, in the same
	 * Outfit files. So a bio breaks in the same place here, in the app and in
	 * a months-old snapshot.
	 *
	 * Layering, bottom to top (card spec §7): face colour; photo, text, bio box
	 * and pills; the tier foil over the whole face; stickers.
	 */
	import type { CardView, PlacedSticker } from '$lib/types';
	import { inkFor, normalizeStyle, withAlpha, type CardStyle } from '$lib/card-style';
	import { BIO, BOX, CARD_W, FRAME, LINKS, NAME, PILL, TAG } from '$lib/app-card/layout/spec';
	import { layoutFront, type Rect } from '$lib/app-card/layout/front';
	import { coverCrop, panFocal, type Focal } from '$lib/app-card/layout/crop';
	import { displayHandle, normalizeLinks } from '$lib/app-card/links';
	import type { FoilKind } from '$lib/app-card/tiers';
	import type { StickerCatalog } from '$lib/card';
	import CardShell from './CardShell.svelte';
	import LinkIcon from './LinkIcon.svelte';
	import StickerLayer from './StickerLayer.svelte';

	interface Props {
		view: CardView;
		catalog: StickerCatalog;
		/**
		 * The tier foil over the face (`foilForTier`): `none` still draws the
		 * gloss and lip; leave it out for a face with no light at all.
		 */
		foil?: FoilKind;
		/** Pointer tilt, in degrees (FlipCard's rx / ry): drives the light. */
		rx?: number;
		ry?: number;
		/** `thumb`: binder minis — the light holds still, stickers draw plain. */
		detail?: 'full' | 'thumb';
		intensity?: number;
		/** When set, stickers and the photo become pointer targets. */
		editable?: boolean;
		selectedId?: string | null;
		badgeSelected?: boolean;
		onstickerdown?: (sticker: PlacedSticker, event: PointerEvent) => void;
		onstickerhandledown?: (
			sticker: PlacedSticker,
			handle: 'rotate' | 'resize',
			event: PointerEvent
		) => void;
		onbadgedown?: (event: PointerEvent) => void;
		onfacedown?: (event: PointerEvent) => void;
		/** The photo was dragged: its new focal point (0..1 of the image). */
		onartpan?: (x: number, y: number) => void;
	}

	let {
		view,
		catalog,
		foil,
		rx = 0,
		ry = 0,
		detail = 'full',
		intensity = 1,
		editable = false,
		selectedId = null,
		badgeSelected = false,
		onstickerdown,
		onstickerhandledown,
		onbadgedown,
		onfacedown,
		onartpan
	}: Props = $props();

	// Normalised here, not trusted: snapshots were written by older builds,
	// before `alignment`, `photo_height` or handles.
	const style = $derived<CardStyle>(normalizeStyle(view.style));
	const links = $derived(normalizeLinks(view.links));
	const layout = $derived(
		layoutFront({
			name: view.title,
			username: view.handle,
			pronouns: view.pronouns,
			bio: view.bio,
			linkHandles: links.map(displayHandle),
			photoShape: style.photo_shape,
			photoHeight: style.photo_height,
			alignment: style.alignment
		})
	);
	const ink = $derived(inkFor(style.bg));

	let width = $state(0);
	const s = $derived(width / CARD_W);

	/** Units → a CSS length. */
	const u = (n: number) => `calc(var(--u) * ${n})`;
	/** A card-coordinate rect → an absolute box inside the face (inset by the edge). */
	const place = (r: Rect) =>
		`left: ${u(r.x - FRAME.edge)}; top: ${u(r.y - FRAME.edge)}; width: ${u(r.w)}; height: ${u(r.h)};`;
	/** The spec's 1-unit outline, never thinner than the web's hairline. */
	const BW = `max(var(--u) * ${BOX.outline}, 1px)`;

	/**
	 * The username's box, a few units wider than measured on the side away
	 * from its anchor, so a browser that renders a hair wider than the metrics
	 * never clips its last character (CardFace's `slack`).
	 */
	function slack(r: Rect, align: 'left' | 'center' | 'right'): Rect {
		const extra = 4;
		const x = align === 'left' ? r.x : align === 'right' ? r.x - extra : r.x - extra / 2;
		return { ...r, x, w: r.w + extra };
	}

	const text = (family: string, size: number, lineHeight: number, color: string) =>
		`font-family: ${family}; font-size: ${u(size)}; line-height: ${u(lineHeight)}; color: ${color};`;
	const FAMILY = { 400: 'Outfit-Regular', 600: 'Outfit-SemiBold', 700: 'Outfit-Bold' } as const;

	const boxFill = $derived(
		`background-color: ${withAlpha(ink.raised, BOX.fillOpacity)}; border: ${BW} solid ${ink.line};`
	);

	// ---- the photo: cover-cropped around its focal point (spec §3.3) ----
	let natural = $state<{ url: string; w: number; h: number } | null>(null);
	const focal = $derived<Focal>({ x: view.art_x, y: view.art_y, zoom: view.art_scale });
	const known = $derived(view.art_url && natural?.url === view.art_url ? natural : null);
	const crop = $derived(
		known && width > 0
			? coverCrop(known.w, known.h, layout.photo.clip.w * s, layout.photo.clip.h * s, focal)
			: null
	);
	function onImgLoad(e: Event) {
		const img = e.currentTarget as HTMLImageElement;
		if (view.art_url) natural = { url: view.art_url, w: img.naturalWidth, h: img.naturalHeight };
	}

	let photoDrag: { pointerId: number; x: number; y: number; from: Focal } | null = null;
	function onPhotoDown(e: PointerEvent) {
		if (!onartpan || !known) return;
		e.stopPropagation();
		photoDrag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, from: focal };
		(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
	}
	function onPhotoMove(e: PointerEvent) {
		const d = photoDrag;
		if (!d || e.pointerId !== d.pointerId || !known) return;
		const next = panFocal(
			{ ...d.from, zoom: focal.zoom },
			e.clientX - d.x,
			e.clientY - d.y,
			known.w,
			known.h,
			layout.photo.clip.w * s,
			layout.photo.clip.h * s
		);
		onartpan?.(next.x, next.y);
	}
	function onPhotoUp(e: PointerEvent) {
		if (photoDrag?.pointerId === e.pointerId) photoDrag = null;
	}

	const radii = $derived(layout.photo.radii);
</script>

<CardShell {style} {foil} {rx} {ry} {intensity} {detail} {editable} {onfacedown} bind:width>
	<!-- Name -->
	<div class="box" style={place(layout.name.rect)}>
		<div
			class="line"
			style="{text(FAMILY[NAME.weight], NAME.size, NAME.lineHeight, ink.ink)} letter-spacing: {u(
				NAME.tracking * NAME.size
			)}; text-align: {layout.name.align};"
		>
			{layout.name.text}
		</div>
	</div>

	<!-- @username: never truncates -->
	<div
		class="box line"
		style="{place(slack(layout.username.rect, style.alignment))} {text(
			FAMILY[TAG.weight],
			TAG.size,
			TAG.lineHeight,
			ink.mute
		)} text-align: {style.alignment};"
	>
		{layout.username.text}
	</div>

	<!-- Pronoun pill -->
	{#if layout.pill}
		<div
			class="box pill"
			style="{place(layout.pill.rect)} {boxFill} border-radius: {u(PILL.radius)};"
		>
			<div class="pill-in" style="inset: calc(-1 * {BW}); padding: 0 {u(PILL.padX)};">
				<div
					class="line"
					style="{text(
						FAMILY[PILL.weight],
						PILL.size,
						PILL.size * 1.3,
						ink.ink
					)} text-align: center;"
				>
					{layout.pill.text}
				</div>
			</div>
		</div>
	{/if}

	<!-- Photo: the picture clipped to its shape, or only the shape's outline -->
	<div
		class="box photo"
		class:empty={!view.art_url}
		class:pannable={editable && !!onartpan && !!known}
		style="{place(layout.photo.clip)} border-radius: {u(radii.tl)} {u(radii.tr)} {u(radii.br)} {u(
			radii.bl
		)}; {view.art_url ? '' : `border: ${BW} solid ${ink.line};`}"
		role={editable ? 'presentation' : undefined}
		onpointerdown={editable ? onPhotoDown : undefined}
		onpointermove={editable ? onPhotoMove : undefined}
		onpointerup={editable ? onPhotoUp : undefined}
		onpointercancel={editable ? onPhotoUp : undefined}
	>
		{#if view.art_url}
			<img
				src={view.art_url}
				alt=""
				draggable="false"
				onload={onImgLoad}
				style={crop
					? `left: ${crop.x}px; top: ${crop.y}px; width: ${crop.w}px; height: ${crop.h}px;`
					: 'inset: 0; width: 100%; height: 100%; object-fit: cover;'}
			/>
		{:else if editable}
			<span class="add" style="{text(FAMILY[600], 10, 12, ink.mute)} letter-spacing: {u(1.1)};"
				>Add photo</span
			>
		{/if}
	</div>

	<!-- Bio box -->
	{#if layout.bio}
		{@const bio = layout.bio}
		<div class="box bio" style="{place(bio.rect)} {boxFill} border-radius: {u(BIO.radius)};">
			<div
				class="bio-in"
				style="left: {u(BIO.padX)}; right: {u(BIO.padX)}; top: {u(BIO.padY)}; bottom: {u(
					BIO.padY
				)};"
			>
				{#each bio.lines as line, i (i)}
					<div
						class="line bio-line"
						style="{text(FAMILY[BIO.weight], BIO.size, BIO.lineHeight, ink.mute)} top: {u(
							i * BIO.lineHeight
						)}; height: {u(BIO.lineHeight)}; text-align: {bio.align};"
					>
						{line}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Link pills: always left-aligned inside, whatever the alignment -->
	{#each layout.links.pills as pill (pill.index)}
		<div class="box" style="{place(pill.rect)} {boxFill} border-radius: {u(LINKS.radius)};">
			<div
				class="icon"
				style="left: calc({u(pill.icon.x - pill.rect.x)} - {BW}); top: calc({u(
					pill.icon.y - pill.rect.y
				)} - {BW}); width: {u(LINKS.icon)}; height: {u(LINKS.icon)};"
			>
				<LinkIcon url={links[pill.index]?.url ?? ''} color={ink.mute} />
			</div>
			<div
				class="line link-text"
				style="{text(FAMILY[LINKS.weight], LINKS.size, LINKS.lineHeight, ink.mute)} left: calc({u(
					pill.text.x - pill.rect.x
				)} - {BW}); top: calc(-1 * {BW}); width: {u(pill.text.w)}; height: {u(pill.text.h)};"
			>
				{pill.label}
			</div>
		</div>
	{/each}

	{#snippet overlay()}
		<StickerLayer
			{view}
			{catalog}
			{width}
			{rx}
			{ry}
			{detail}
			animate={detail === 'full'}
			{editable}
			{selectedId}
			{badgeSelected}
			{onstickerdown}
			{onstickerhandledown}
			{onbadgedown}
		/>
	{/snippet}
</CardShell>

<style>
	.box {
		position: absolute;
		box-sizing: border-box;
	}
	/* One line of card text: never wrapped, never re-ellipsised — the string
	   is already cut to fit by measurement; a hair of overflow is clipped. */
	.line {
		display: block;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: clip;
		font-weight: normal;
		font-kerning: normal;
	}
	.pill-in {
		position: absolute;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}
	.photo {
		overflow: hidden;
		/* over the text, under the foil (CardFace lifts it to 1) */
		z-index: 1;
	}
	.photo img {
		position: absolute;
		display: block;
		max-width: none;
		user-select: none;
		pointer-events: none;
	}
	.photo.pannable {
		cursor: grab;
		touch-action: none;
		pointer-events: auto;
	}
	.photo.empty {
		display: grid;
		place-items: center;
	}
	.add {
		text-transform: uppercase;
	}
	.bio {
		overflow: hidden;
	}
	.bio-in {
		position: absolute;
	}
	.bio-line {
		position: absolute;
		left: 0;
		right: 0;
	}
	.icon,
	.link-text {
		position: absolute;
	}
</style>
