<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import CardBack from '$lib/components/CardBack.svelte';
	import FlipCard from '$lib/components/FlipCard.svelte';
	import {
		ART_DEFAULT,
		BADGE_HOME,
		BG_KEYS,
		FRAME_KEYS,
		PHOTO_SHAPES,
		SHAPES,
		stickerRotation,
		type CardStyle
	} from '$lib/card-style';
	import { demoCatalog } from '$lib/demo-card';
	import type { CardView, PlacedSticker } from '$lib/types';

	const catalog = demoCatalog();

	const base: Omit<CardView, 'style'> = {
		title: 'Oskar',
		handle: 'oskar',
		bio: 'Anime and sci-fi con regular. Making concard. Will trade stickers for good tea recommendations.',
		art_url: null,
		art_x: ART_DEFAULT.x,
		art_y: ART_DEFAULT.y,
		art_scale: ART_DEFAULT.scale,
		affiliation: {
			id: 'anime',
			name: 'Anime',
			mark: 'ANI',
			color_a: '#ff7eb6',
			color_b: '#7c4dff',
			...BADGE_HOME
		},
		links: [
			{ label: 'Bluesky', url: 'https://bsky.app/oskar' },
			{ label: 'Itch', url: 'https://oskar.itch.io' },
			{ label: 'Site', url: 'https://oskar.dev' },
			{ label: 'Ko-fi', url: 'https://ko-fi.com/oskar' },
			{ label: 'Tumblr', url: 'https://oskar.tumblr.com' }
		],
		stickers: [
			{ id: 'a', sticker_id: 'star', x: 0.96, y: 0.06, rotation: 0, scale: 1, z_index: 1 },
			{ id: 'b', sticker_id: 'cat', x: 0.08, y: 0.62, rotation: -10, scale: 1.1, z_index: 2 },
			{ id: 'c', sticker_id: 'dragon', x: 0.9, y: 0.9, rotation: 15, scale: 0.9, z_index: 3 },
			{ id: 'd', sticker_id: 'rainbow', x: -0.04, y: 0.3, rotation: 0, scale: 1, z_index: 4 }
		]
	};

	const withArt = { ...base, art_url: 'https://picsum.photos/seed/concard/600/600' };

	const hero: CardStyle = { frame: 'gold', bg: 'mint', shape: 'rounded', photo_shape: 'arch' };
	const variants: CardStyle[] = [
		{ frame: 'silver', bg: 'paper', shape: 'rounded', photo_shape: 'round' },
		{ frame: 'holo', bg: 'sky', shape: 'shaved', photo_shape: 'circle' },
		{ frame: 'ink', bg: 'slate', shape: 'rect', photo_shape: 'square' },
		{ frame: 'gold', bg: 'blush', shape: 'shaved', photo_shape: 'arch' },
		{ frame: 'silver', bg: 'butter', shape: 'rect', photo_shape: 'round' },
		{ frame: 'holo', bg: 'slate', shape: 'rounded', photo_shape: 'circle' }
	];

	let flipped = $state(false);

	// ---- editable preview: the on-card Look controls and photo pan/zoom,
	// wired the same way the real edit screen wires them, so this page can
	// exercise the interaction without any backend behind it. ----
	let editStyle = $state<CardStyle>({ ...hero });
	let editArtUrl = $state<string | null>('https://picsum.photos/seed/concard-edit/500/900');
	let editArtX = $state(ART_DEFAULT.x);
	let editArtY = $state(ART_DEFAULT.y);
	let editArtScale = $state(ART_DEFAULT.scale);
	const editView = $derived<CardView>({
		...base,
		art_url: editArtUrl,
		style: editStyle,
		art_x: editArtX,
		art_y: editArtY,
		art_scale: editArtScale
	});
	function stepIn<T>(values: readonly T[], current: T, dir: 1 | -1): T {
		const i = values.indexOf(current);
		return values[(i + dir + values.length) % values.length];
	}

	// ---- sticker rotate/resize handles: same drag math as the real edit
	// screen, so this exercises it without a backend. ----
	let editEl: HTMLDivElement | undefined = $state();
	let editPlaced = $state<PlacedSticker[]>(base.stickers.map((s) => ({ ...s })));
	let editSelectedId = $state<string | null>(null);
	const editViewFull = $derived<CardView>({ ...editView, stickers: editPlaced });

	type StickerDrag =
		| { kind: 'move'; id: string; pointerId: number }
		| { kind: 'rotate'; id: string; pointerId: number }
		| { kind: 'resize'; id: string; pointerId: number };
	let stickerDrag: StickerDrag | null = null;
	const STICKER_BASE_RADIUS_FRAC = 0.1533 / 2;

	function onEditStickerDown(s: PlacedSticker, e: PointerEvent) {
		if (!s.id) return;
		editSelectedId = s.id;
		stickerDrag = { kind: 'move', id: s.id, pointerId: e.pointerId };
		(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
	}
	function onEditStickerHandleDown(s: PlacedSticker, handle: 'rotate' | 'resize', e: PointerEvent) {
		if (!s.id) return;
		editSelectedId = s.id;
		stickerDrag = { kind: handle, id: s.id, pointerId: e.pointerId };
		(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
	}
	function onEditMove(e: PointerEvent) {
		const d = stickerDrag;
		if (!d || e.pointerId !== d.pointerId || !editEl) return;
		const r = editEl.getBoundingClientRect();
		if (d.kind === 'move') {
			const x = Math.min(1.02, Math.max(-0.14, (e.clientX - r.left) / r.width));
			const y = Math.min(0.96, Math.max(-0.1, (e.clientY - r.top) / r.height));
			editPlaced = editPlaced.map((p) => (p.id === d.id ? { ...p, x, y } : p));
			return;
		}
		const p = editPlaced.find((q) => q.id === d.id);
		if (!p) return;
		const cx = r.left + p.x * r.width;
		const cy = r.top + p.y * r.height;
		if (d.kind === 'rotate') {
			const screenAngle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
			const raw = screenAngle + 90 - stickerRotation(d.id);
			const rotation = ((((raw + 180) % 360) + 360) % 360) - 180;
			editPlaced = editPlaced.map((q) => (q.id === d.id ? { ...q, rotation } : q));
		} else {
			const baseRadius = r.width * STICKER_BASE_RADIUS_FRAC;
			const scale = Math.min(
				3,
				Math.max(0.25, Math.hypot(e.clientX - cx, e.clientY - cy) / baseRadius)
			);
			editPlaced = editPlaced.map((q) => (q.id === d.id ? { ...q, scale } : q));
		}
	}
	function onEditUp() {
		stickerDrag = null;
	}
	function onEditFaceDown() {
		editSelectedId = null;
	}
</script>

<svelte:window onpointermove={onEditMove} onpointerup={onEditUp} onpointercancel={onEditUp} />

<svelte:head><title>Card gallery · dev</title></svelte:head>

<h1 class="display text-xl">Card gallery</h1>
<p class="text-xs text-faint">Dev only. Drag the hero to tilt, tap to flip.</p>

<section class="mx-auto mt-6 max-w-[320px]" data-shot="hero">
	<FlipCard bind:flipped>
		{#snippet front(t)}<Card
				view={{ ...withArt, style: hero }}
				{catalog}
				rx={t.rx}
				ry={t.ry}
				dragging={t.dragging}
			/>{/snippet}
		{#snippet back(t)}<CardBack
				variant="qr"
				rx={t.rx}
				ry={t.ry}
				dragging={t.dragging}
				style={hero}
				url="concard.me/oskar"
				qrSvg="<svg viewBox='0 0 21 21' xmlns='http://www.w3.org/2000/svg'><rect width='21' height='21' fill='#fff'/><path fill='#111' d='M0 0h7v7H0zM1 1v5h5V1zM2 2h3v3H2zM14 0h7v7h-7zM15 1v5h5V1zM16 2h3v3h-3zM0 14h7v7H0zM1 15v5h5v-5zM2 16h3v3H2zM9 0h1v1H9zM11 0h1v2h-1zM9 2h2v1H9zM12 3h1v1h-1zM9 4h1v2H9zM11 5h2v1h-2zM0 9h1v1H0zM2 9h2v1H2zM5 9h1v2H5zM7 8h1v1H7zM9 8h2v1H9zM12 8h1v2h-1zM14 9h1v1h-1zM16 8h2v1h-2zM19 9h2v1h-2zM1 11h1v2H1zM3 12h2v1H3zM7 11h1v1H7zM9 11h1v2H9zM11 11h2v1h-2zM14 11h1v2h-1zM16 12h1v1h-1zM18 11h1v1h-1zM20 12h1v1h-1zM9 14h2v1H9zM12 14h1v2h-1zM14 14h2v2h-2zM17 14h1v1h-1zM19 14h2v1h-2zM9 16h1v1H9zM11 17h1v1h-1zM13 17h2v1h-2zM16 16h1v2h-1zM18 16h1v1h-1zM20 17h1v2h-1zM9 19h1v2H9zM11 19h2v1h-2zM14 19h1v2h-1zM16 19h2v1h-2zM19 20h1v1h-1z'/></svg>"
			/>{/snippet}
	</FlipCard>
	<button class="mt-3 btn-secondary w-full" type="button" onclick={() => (flipped = !flipped)}
		>Flip</button
	>
</section>

<h2 class="mt-10 text-sm font-bold text-dim">Editable (mobile edit preview)</h2>
<p class="text-xs text-faint">
	Look controls float right on the card; drag the photo to pan, use the +/− to zoom.
</p>
<section class="mx-auto mt-4 max-w-[228px]" bind:this={editEl} data-shot="editable">
	<Card
		view={editViewFull}
		{catalog}
		editable
		selectedId={editSelectedId}
		onstickerdown={onEditStickerDown}
		onstickerhandledown={onEditStickerHandleDown}
		onfacedown={onEditFaceDown}
		onframestep={(dir) => (editStyle.frame = stepIn(FRAME_KEYS, editStyle.frame, dir))}
		onbgstep={(dir) => (editStyle.bg = stepIn(BG_KEYS, editStyle.bg, dir))}
		oncornersstep={(dir) => (editStyle.shape = stepIn(SHAPES, editStyle.shape, dir))}
		onphotoshapestep={(dir) =>
			(editStyle.photo_shape = stepIn(PHOTO_SHAPES, editStyle.photo_shape, dir))}
		onzoomstep={(dir) => (editArtScale = Math.min(3, Math.max(1, editArtScale + dir * 0.15)))}
		onartpan={(x, y) => {
			editArtX = x;
			editArtY = y;
		}}
	/>
</section>

<h2 class="mt-10 text-sm font-bold text-dim">Variants</h2>
<ul class="mt-3 grid grid-cols-3 gap-5" data-shot="variants">
	{#each variants as style (JSON.stringify(style))}
		<li>
			<Card view={{ ...base, style }} {catalog} />
			<p class="mt-2 text-center text-[10px] text-faint">
				{style.frame} · {style.bg} · {style.shape} · {style.photo_shape}
			</p>
		</li>
	{/each}
</ul>

<h2 class="mt-10 text-sm font-bold text-dim">Every background</h2>
<ul class="mt-3 grid grid-cols-3 gap-4" data-shot="bgs">
	{#each BG_KEYS as bg (bg)}
		<li>
			<Card
				view={{
					...base,
					links: base.links.slice(0, 2),
					style: { frame: 'silver', bg, shape: 'rounded', photo_shape: 'round' }
				}}
				{catalog}
			/>
			<p class="mt-1 text-center text-[10px] text-faint">{bg}</p>
		</li>
	{/each}
</ul>

<h2 class="mt-10 text-sm font-bold text-dim">Backs</h2>
<ul class="mt-3 grid grid-cols-2 gap-5" data-shot="backs">
	<li>
		<CardBack
			variant="qr"
			style={variants[1]}
			url="concard.me/oskar"
			qrSvg="<svg viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'><rect width='4' height='4' fill='#fff'/><path fill='#111' d='M0 0h1v1H0zM2 0h1v1H2zM1 1h1v1H1zM3 1h1v1H3zM0 2h1v1H0zM2 2h1v1H2zM1 3h1v1H1zM3 3h1v1H3z'/></svg>"
		/>
	</li>
	<li>
		<CardBack
			variant="record"
			style={variants[3]}
			record={{
				collected: '12 Sep 2026, 01:14',
				event: 'No event',
				note: 'Traded with @alice. They have your card too.'
			}}
		/>
	</li>
</ul>

<h2 class="mt-10 text-sm font-bold text-dim">Thumbnail size</h2>
<ul class="mt-3 grid grid-cols-6 gap-3" data-shot="thumbs">
	{#each variants as style (JSON.stringify(style))}
		<li><Card view={{ ...withArt, style }} {catalog} /></li>
	{/each}
</ul>

<p class="mt-10 text-xs text-faint">
	All frames: {FRAME_KEYS.join(', ')}. Backgrounds: {BG_KEYS.join(', ')}. Shapes: {SHAPES.join(
		', '
	)}. Photo: {PHOTO_SHAPES.join(', ')}.
</p>
