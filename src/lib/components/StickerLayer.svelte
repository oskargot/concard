<script lang="ts">
	/**
	 * Everything outside the face clip: the stickers, the fandom affiliation
	 * among them — concard-app's `CardOverlay`, at its geometry (centre as card
	 * fractions, base size as a fraction of the card's width, `scale`, rotation
	 * plus the fixed wobble).
	 *
	 * Two ways of drawing, one geometry:
	 *
	 *  - As elements: each sticker's art (`<img>` or the fandom SVG), plain.
	 *    This is what renders on the server, before the foil engine has
	 *    loaded, without WebGL, and on binder minis (the app draws minis'
	 *    stickers without foil too).
	 *  - As one bitmap: when the card carries a foiled sticker, the whole layer
	 *    is painted by the foil engine into a single canvas, in z order — each
	 *    sticker's art, then the card's own foil and gloss inside its die cut,
	 *    lit by this card's tilt (`StickerFoil.tsx`'s `DecoFoilCanvas`). One
	 *    canvas per card, however many stickers. The elements stay underneath,
	 *    invisible, as pointer targets and for their alt text.
	 */
	import { onMount } from 'svelte';
	import type { Image as CkImage } from 'canvaskit-wasm';
	import type { PlacedSticker, CardView } from '$lib/types';
	import { stickerRotation } from '$lib/card-style';
	import { bakedArt, type StickerCatalog } from '$lib/card';
	import { BAKED_ART_SCALE } from '$lib/sticker-art';
	import {
		AFFILIATION_STICKER_WIDTH,
		baseSizeOf,
		decoArt,
		decoBox,
		lookFor,
		type StickerLook
	} from '$lib/stickers/resolve';
	import { fandomSvgLayout } from '$lib/stickers/fandom-svg';
	import { tiltOf, type FoilEngine, type Sprite } from '$lib/foil/engine';
	import { foil, foilEngine } from '$lib/foil/scheduler';
	import { fandomBitmaps } from '$lib/foil/sticker-art';
	import StickerGlyph from './StickerGlyph.svelte';
	import FandomSticker from './FandomSticker.svelte';

	interface Props {
		view: CardView;
		catalog: StickerCatalog;
		/** The card's width in px (0 until measured). */
		width: number;
		rx?: number;
		ry?: number;
		/** `thumb`: binder minis — stickers draw without foil, as in the app. */
		detail?: 'full' | 'thumb';
		/** Idle drift on (a hero card) or held still. */
		animate?: boolean;
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
	}

	let {
		view,
		catalog,
		width,
		rx = 0,
		ry = 0,
		detail = 'full',
		animate = false,
		editable = false,
		selectedId = null,
		badgeSelected = false,
		onstickerdown,
		onstickerhandledown,
		onbadgedown
	}: Props = $props();

	/** Legacy affiliations (card columns, not yet a placement) drew above every sticker. */
	const LEGACY_AFFILIATION_Z = 1000;
	const AFFILIATION_ID = '__affiliation';

	const stickers = $derived.by<PlacedSticker[]>(() => {
		const placed = [...view.stickers];
		const a = view.affiliation;
		if (a && !placed.some((s) => s.is_affiliation)) {
			placed.push({
				id: AFFILIATION_ID,
				sticker_id: `fandom-${a.id}`,
				kind: 'fandom',
				label: a.name,
				style_category: a.style_category,
				fandom_id: a.id,
				x: a.x,
				y: a.y,
				rotation: a.rotation,
				scale: a.scale,
				foil: a.foil,
				size: AFFILIATION_STICKER_WIDTH,
				is_affiliation: true,
				z_index: LEGACY_AFFILIATION_Z
			});
		}
		return placed.sort((p, q) => p.z_index - q.z_index);
	});

	interface Item {
		s: PlacedSticker;
		key: string;
		look: StickerLook;
		baked: ReturnType<typeof bakedArt>;
		isAffiliation: boolean;
		/** Base size, as a fraction of the card's width. */
		base: number;
		rotation: number;
		z: number;
	}

	const items = $derived<Item[]>(
		stickers.map((s) => {
			const row = catalog.get(s.sticker_id);
			const isAffiliation = s.id === AFFILIATION_ID || !!s.is_affiliation;
			return {
				s,
				key: s.id ?? `${s.sticker_id}-${s.x}-${s.y}`,
				look: lookFor(s, row),
				baked: bakedArt(row),
				isAffiliation,
				base: baseSizeOf(s),
				rotation: s.rotation + (isAffiliation ? 0 : stickerRotation(s.id ?? s.sticker_id)),
				z: isAffiliation && s.z_index === LEGACY_AFFILIATION_Z ? 20 : s.z_index + 1
			};
		})
	);

	/** A sticker's box as CSS, in the card's own width units. */
	function boxStyle(it: Item): string {
		const { look, base } = it;
		if (look.kind === 'deco') {
			const b = decoBox(look.aspect, base * 100);
			return `width: ${b.width}cqw; height: ${b.height}cqw;`;
		}
		if (look.kind === 'fandom') return `width: ${base * 100}cqw; height: auto;`;
		return `width: ${base * 100}cqw; height: ${base * 100}cqw;`;
	}

	let dpr = $state(1);
	onMount(() => {
		dpr = window.devicePixelRatio || 1;
	});

	// ---- the painted layer ----
	let engine = $state<FoilEngine | null>(null);
	let sprites = $state.raw<Sprite[] | null>(null);
	let painted = $state(false);

	const height = $derived((width * 350) / 250);
	const wantsPaint = $derived(
		detail === 'full' && width > 0 && items.some((it) => it.s.foil !== 'none')
	);

	/** Every sticker's box in px, for the bitmap. Null when one can't be painted. */
	interface Plan {
		it: Item;
		w: number;
		h: number;
		load: (e: FoilEngine) => Promise<{ art: CkImage; mask: CkImage | null } | null>;
	}
	const plans = $derived.by<Plan[] | null>(() => {
		if (!wantsPaint) return null;
		const out: Plan[] = [];
		for (const it of items) {
			const size = it.base * width;
			const { look } = it;
			if (look.kind === 'deco') {
				const box = decoBox(look.aspect, size);
				const art = decoArt(look, size, dpr);
				out.push({
					it,
					...{ w: box.width, h: box.height },
					load: async (e) => {
						const [a, m] = await Promise.all([e.image(art), e.image(look.mask)]);
						return a ? { art: a, mask: m } : null;
					}
				});
			} else if (look.kind === 'fandom') {
				const svg = fandomSvgLayout(look.label, look.styleCategory, size);
				if (!svg) continue;
				out.push({
					it,
					w: svg.width,
					h: svg.height,
					load: (e) => fandomBitmaps(e, look.label, look.styleCategory, size, it.s.scale * dpr)
				});
			} else if (it.baked) {
				// The web's older bakes: the canvas overflows the box by
				// BAKED_ART_SCALE, as `.cut.baked` draws it.
				const baked = it.baked;
				out.push({
					it,
					w: size * BAKED_ART_SCALE,
					h: size * BAKED_ART_SCALE,
					load: async (e) => {
						const [a, m] = await Promise.all([e.image(baked.src), e.image(baked.mask)]);
						return a ? { art: a, mask: m } : null;
					}
				});
			} else {
				// A glyph or an admin upload with a CSS rim: only the elements can draw it.
				return null;
			}
		}
		return out;
	});

	$effect(() => {
		if (wantsPaint && !engine) foilEngine().then((e) => (engine = e));
	});

	$effect(() => {
		const p = plans;
		const e = engine;
		if (!p || !e) {
			sprites = null;
			return;
		}
		let live = true;
		Promise.all(p.map((plan) => plan.load(e))).then((loaded) => {
			if (!live) return;
			if (loaded.some((l) => !l)) {
				sprites = null;
				return;
			}
			sprites = p.map((plan, i) => ({
				art: loaded[i]!.art,
				mask: loaded[i]!.mask,
				w: plan.w,
				h: plan.h,
				cx: plan.it.s.x * width,
				cy: plan.it.s.y * height,
				rotation: plan.it.rotation,
				scale: plan.it.s.scale,
				foil: plan.it.s.foil
			}));
		});
		return () => {
			live = false;
		};
	});

	/** The card-px rectangle every sticker fits inside, rotated and scaled. */
	const area = $derived.by(() => {
		if (!sprites?.length) return null;
		let x0 = Infinity;
		let y0 = Infinity;
		let x1 = -Infinity;
		let y1 = -Infinity;
		for (const s of sprites) {
			const t = (s.rotation * Math.PI) / 180;
			const hw = ((Math.abs(Math.cos(t)) * s.w + Math.abs(Math.sin(t)) * s.h) * s.scale) / 2;
			const hh = ((Math.abs(Math.sin(t)) * s.w + Math.abs(Math.cos(t)) * s.h) * s.scale) / 2;
			x0 = Math.min(x0, s.cx - hw);
			y0 = Math.min(y0, s.cy - hh);
			x1 = Math.max(x1, s.cx + hw);
			y1 = Math.max(y1, s.cy + hh);
		}
		const pad = 2;
		const x = Math.floor(x0 - pad);
		const y = Math.floor(y0 - pad);
		return { x, y, w: Math.ceil(x1 + pad) - x, h: Math.ceil(y1 + pad) - y };
	});

	const tilt = $derived(tiltOf(rx, ry));

	$effect(() => {
		if (!area) painted = false;
	});
</script>

{#if wantsPaint}
	{#if area && sprites && engine}
		<canvas
			class="paint"
			style="left: {area.x}px; top: {area.y}px; width: {area.w}px; height: {area.h}px;"
			use:foil={{
				animate,
				draw: (e, canvas, time) => {
					e.drawSprites(
						canvas,
						{ width, height },
						area,
						dpr,
						{ tilt, time: animate ? time : 0 },
						sprites!
					);
					painted = true;
				}
			}}
		></canvas>
	{/if}
{/if}

{#each items as it (it.key)}
	{@const s = it.s}
	{@const isSelected =
		editable && (it.isAffiliation ? badgeSelected : s.id != null && s.id === selectedId)}
	<div
		class="sticker"
		class:selected={isSelected}
		class:painted={painted && !!sprites}
		role={editable ? 'presentation' : undefined}
		style="left: {s.x * 100}%; top: {s.y * 100}%; z-index: {isSelected ? 1000 : it.z};
			transform: translate(-50%, -50%) rotate({it.rotation}deg) scale({s.scale}); {boxStyle(it)}"
		onpointerdown={editable && (it.isAffiliation ? onbadgedown : onstickerdown)
			? (e) => {
					e.stopPropagation();
					if (it.isAffiliation) onbadgedown?.(e);
					else onstickerdown?.(s, e);
				}
			: undefined}
	>
		<div class="art">
			{#if it.look.kind === 'deco'}
				<img src={decoArt(it.look, it.base * width, dpr)} alt={it.look.name} draggable="false" />
			{:else if it.look.kind === 'fandom'}
				{#if width > 0}
					<FandomSticker
						label={it.look.label}
						styleCategory={it.look.styleCategory}
						width={it.base * width}
					/>
				{/if}
			{:else}
				<div
					class="cut"
					class:baked={!!it.baked}
					style={it.baked ? `--art-scale: ${BAKED_ART_SCALE * 100}%` : undefined}
				>
					<StickerGlyph sticker={catalog.get(s.sticker_id)} label={false} />
				</div>
			{/if}
		</div>
		{#if isSelected && onstickerhandledown && !it.isAffiliation}
			{@const handleScale = Math.min(2, Math.max(0.6, 1 / s.scale))}
			<button
				type="button"
				class="grip grip-rotate"
				style="transform: translate(-50%, -50%) scale({handleScale})"
				aria-label="Rotate sticker"
				onpointerdown={(e) => {
					e.stopPropagation();
					onstickerhandledown(s, 'rotate', e);
				}}>↻</button
			>
			<button
				type="button"
				class="grip grip-resize"
				style="transform: translate(50%, 50%) scale({handleScale})"
				aria-label="Resize sticker"
				onpointerdown={(e) => {
					e.stopPropagation();
					onstickerhandledown(s, 'resize', e);
				}}
			></button>
		{/if}
	</div>
{/each}

<style>
	.paint {
		position: absolute;
		z-index: 0;
		pointer-events: none;
	}
	.sticker {
		position: absolute;
		display: grid;
		place-items: center;
		transform-origin: center;
		pointer-events: none;
		--rim: #fbf9f3;
		--rim-w: 0.7cqw;
		/* the 8 diagonal offsets below, at cos/sin 30°: with the 4 cardinal
		   offsets that makes 12 evenly-spaced copies instead of 4, so the rim
		   traces an actual round dilation instead of a diamond. */
		--rim-a: calc(var(--rim-w) * 0.866);
		--rim-b: calc(var(--rim-w) * 0.5);
	}
	.art {
		width: 100%;
		height: 100%;
		display: grid;
		place-items: center;
	}
	.art img {
		display: block;
		width: 100%;
		height: 100%;
		pointer-events: none;
		user-select: none;
	}
	/* painted by the foil engine: the element stays as the pointer target */
	.painted .art {
		visibility: hidden;
	}
	.cut {
		position: relative;
		width: 100%;
		height: 100%;
		display: grid;
		place-items: center;
		font-size: 11cqw;
		line-height: 1;
	}
	/* The web's older bakes carry the rim and shadows around the artwork, so
	   the image overflows its box by --art-scale. */
	.cut.baked {
		width: var(--art-scale);
		height: var(--art-scale);
		flex: none;
	}
	.cut.baked :global(img) {
		width: 100%;
		height: 100%;
	}
	.cut:not(.baked) {
		/* 12 hard shadows trace the paper rim around the alpha; a soft dark edge
		   keeps pale stickers legible on pale cards; the last one lifts it off the card */
		filter: drop-shadow(var(--rim-w) 0 0 var(--rim))
			drop-shadow(calc(-1 * var(--rim-w)) 0 0 var(--rim)) drop-shadow(0 var(--rim-w) 0 var(--rim))
			drop-shadow(0 calc(-1 * var(--rim-w)) 0 var(--rim))
			drop-shadow(var(--rim-a) var(--rim-b) 0 var(--rim))
			drop-shadow(calc(-1 * var(--rim-a)) var(--rim-b) 0 var(--rim))
			drop-shadow(var(--rim-a) calc(-1 * var(--rim-b)) 0 var(--rim))
			drop-shadow(calc(-1 * var(--rim-a)) calc(-1 * var(--rim-b)) 0 var(--rim))
			drop-shadow(var(--rim-b) var(--rim-a) 0 var(--rim))
			drop-shadow(calc(-1 * var(--rim-b)) var(--rim-a) 0 var(--rim))
			drop-shadow(var(--rim-b) calc(-1 * var(--rim-a)) 0 var(--rim))
			drop-shadow(calc(-1 * var(--rim-b)) calc(-1 * var(--rim-a)) 0 var(--rim))
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
	/* Selection is a ring around the sticker's own box; --ink is the card's
	   own contrasting ink, so it reads on any card. */
	.sticker.selected::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 3;
		border: 0.5cqw solid var(--ink, #17161b);
		border-radius: 1.4cqw;
		pointer-events: none;
	}
	/* rotate/resize handles, inside the sticker's own transform; the inline
	   scale() keeps the dot a constant size. */
	.grip {
		position: absolute;
		display: grid;
		place-items: center;
		width: 1.35rem;
		height: 1.35rem;
		border-radius: 50%;
		border: 1px solid var(--color-line, #34323d);
		background: var(--color-surface, #1c1b22);
		color: var(--color-paper, #efedf2);
		font-size: 0.7rem;
		line-height: 1;
		box-shadow: 0 2px 6px rgb(0 0 0 / 0.4);
		pointer-events: auto;
		touch-action: none;
		cursor: grab;
	}
	.grip-rotate {
		top: -6%;
		left: 50%;
	}
	.grip-resize {
		bottom: 0;
		right: 0;
	}
</style>
