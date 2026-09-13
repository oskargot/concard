<script module lang="ts">
	/**
	 * Prismatic, pointer/tilt-driven foil texture (see
	 * https://github.com/simeydotme/pokemon-cards-css for the reference
	 * technique). Distinct from `FoilFx.svelte`'s glitter/holo tiers: this is
	 * the "physical card catching the light" effect — a rainbow sheen and a
	 * mouse-following glare that shift with real device rotation on mobile or
	 * mouse movement on desktop, instead of an idle CSS loop. Experimental and
	 * opt-in (see `/dev/holo-fx`) until it's picked as the look for a foil tier.
	 */
	export const HOLO_VARIANTS = ['linear', 'radial', 'cosmos', 'aurora'] as const;
	export type HoloVariant = (typeof HOLO_VARIANTS)[number];

	export const HOLO_VARIANT_LABEL: Record<HoloVariant, string> = {
		linear: 'Linear foil',
		radial: 'Radial burst',
		cosmos: 'Cosmos sparkle',
		aurora: 'Aurora'
	};

	type MotionPermission = 'granted' | 'denied' | 'unsupported';

	/**
	 * iOS 13+ gates `deviceorientation` behind an explicit user gesture. Call
	 * this from a click handler; on every other platform the event just works
	 * without asking, so this resolves 'granted' immediately.
	 */
	export async function requestMotionPermission(): Promise<MotionPermission> {
		const DOE = (
			window as unknown as {
				DeviceOrientationEvent?: { requestPermission?: () => Promise<'granted' | 'denied'> };
			}
		).DeviceOrientationEvent;
		if (!DOE) return 'unsupported';
		if (typeof DOE.requestPermission !== 'function') return 'granted';
		try {
			return await DOE.requestPermission();
		} catch {
			return 'denied';
		}
	}
</script>

<script lang="ts">
	import type { Sticker } from '$lib/types';

	interface Props {
		sticker: Sticker | undefined;
		variant?: HoloVariant;
		/** How much of the box the icon actually fills, for mask sizing. */
		iconSize?: number;
	}

	let { sticker, variant = 'linear', iconSize = 0.82 }: Props = $props();

	let rootEl: HTMLDivElement | undefined = $state();
	let px = $state(50); // pointer/tilt x, 0..100
	let py = $state(50); // pointer/tilt y, 0..100
	let interacted = $state(false);

	const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

	function onPointerMove(e: PointerEvent) {
		if (!rootEl) return;
		const r = rootEl.getBoundingClientRect();
		px = clamp(((e.clientX - r.left) / r.width) * 100, 0, 100);
		py = clamp(((e.clientY - r.top) / r.height) * 100, 0, 100);
		interacted = true;
	}
	function onPointerLeave() {
		interacted = false;
	}

	// Mobile has no hover, so device rotation drives the same px/py instead.
	// beta (front/back tilt) is ~35-55deg for a phone held up and looked at, so
	// that range is re-centered to 50%; gamma (left/right tilt) is 0 when flat.
	function onOrientation(e: DeviceOrientationEvent) {
		if (e.beta === null && e.gamma === null) return;
		px = clamp(50 + (e.gamma ?? 0) * 1.8, 0, 100);
		py = clamp(50 + ((e.beta ?? 45) - 45) * 1.6, 0, 100);
		interacted = true;
	}

	$effect(() => {
		window.addEventListener('deviceorientation', onOrientation);
		return () => window.removeEventListener('deviceorientation', onOrientation);
	});

	// Same trick as FoilFx: a same-glyph SVG <text> (or the sticker's own
	// artwork) used purely as a mask, so the effect clips to the sticker's
	// silhouette instead of painting a plain rectangle over it.
	function glyphMask(glyph: string): string {
		const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><text x='50' y='68' font-size='76' text-anchor='middle'>${glyph}</text></svg>`;
		return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
	}

	const iconMask = $derived(
		sticker?.image_url
			? `url("${sticker.image_url}")`
			: sticker?.glyph
				? glyphMask(sticker.glyph)
				: null
	);

	const pct = $derived(`${iconSize * 100}%`);
	const maskStyle = $derived(iconMask ? `mask-image: ${iconMask};` : '');
	const grainMaskStyle = $derived(
		iconMask
			? `mask-image: ${iconMask}, radial-gradient(55% 55% at var(--px) var(--py), #000 0%, rgb(0 0 0 / 0.5) 45%, transparent 78%), url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='g' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='4' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  20 0 0 0 -13'/></filter><rect width='120' height='120' filter='url(%23g)'/></svg>");`
			: ''
	);

	const style = $derived(`--icon-size:${pct};--px:${px}%;--py:${py}%`);
</script>

{#if iconMask}
	<div
		bind:this={rootEl}
		class="holofx {variant}"
		class:interacted
		{style}
		onpointermove={onPointerMove}
		onpointerleave={onPointerLeave}
		aria-hidden="true"
	>
		<div class="rainbow" style={maskStyle}></div>
		<div class="glare" style={maskStyle}></div>
		<div class="grain" style={grainMaskStyle}></div>
	</div>
{/if}

<style>
	.holofx {
		position: absolute;
		inset: 0;
		z-index: 3;
	}

	.rainbow,
	.glare,
	.grain {
		position: absolute;
		inset: 0;
		mask-position: center;
		mask-repeat: no-repeat;
		mask-size: var(--icon-size) var(--icon-size);
		transition:
			background-position 0.4s ease-out,
			mask-position 0.4s ease-out;
	}
	.interacted .rainbow,
	.interacted .glare,
	.interacted .grain {
		transition-duration: 0.08s;
	}

	/* ---- rainbow sheen: the prismatic colour shift itself ---- */
	.rainbow {
		mix-blend-mode: color-dodge;
		opacity: 0.6;
	}
	.linear .rainbow {
		background: repeating-linear-gradient(
			115deg,
			hsl(0 100% 65%) 0%,
			hsl(60 100% 65%) 14%,
			hsl(120 100% 65%) 28%,
			hsl(180 100% 65%) 42%,
			hsl(240 100% 65%) 56%,
			hsl(300 100% 65%) 70%,
			hsl(0 100% 65%) 84%
		);
		background-size: 260% 260%;
		background-position: var(--px) var(--py);
	}
	.radial .rainbow {
		background: conic-gradient(
			from calc(var(--py) * 1deg),
			hsl(0 100% 65%),
			hsl(60 100% 65%),
			hsl(120 100% 65%),
			hsl(180 100% 65%),
			hsl(240 100% 65%),
			hsl(300 100% 65%),
			hsl(0 100% 65%)
		);
		background-size: 220% 220%;
		background-position: var(--px) var(--py);
		mix-blend-mode: hard-light;
		opacity: 0.7;
	}
	.cosmos .rainbow {
		background: repeating-linear-gradient(
			70deg,
			hsl(280 90% 68%) 0%,
			hsl(200 95% 65%) 10%,
			hsl(160 90% 60%) 20%,
			hsl(320 90% 65%) 30%
		);
		background-size: 140% 140%;
		background-position: var(--px) var(--py);
		mix-blend-mode: color-dodge;
		opacity: 0.55;
	}
	.aurora .rainbow {
		background:
			radial-gradient(60% 60% at var(--px) var(--py), hsl(150 90% 65% / 0.9), transparent 70%),
			radial-gradient(
				55% 55% at calc(100% - var(--px)) calc(100% - var(--py)),
				hsl(280 85% 68% / 0.85),
				transparent 70%
			),
			radial-gradient(50% 50% at var(--py) var(--px), hsl(200 95% 65% / 0.8), transparent 72%);
		mix-blend-mode: soft-light;
		opacity: 0.85;
	}

	/* ---- glare: a soft highlight that follows the pointer/tilt for shine ---- */
	.glare {
		background: radial-gradient(
			35% 35% at var(--px) var(--py),
			rgb(255 255 255 / 0.95),
			transparent 65%
		);
		mix-blend-mode: overlay;
		opacity: 0.5;
	}
	.aurora .glare {
		opacity: 0.3;
	}

	/* ---- grain: fine sparkle, parallaxed slightly opposite the light for depth ---- */
	.grain {
		mix-blend-mode: screen;
		opacity: 0.8;
		mask-size:
			var(--icon-size) var(--icon-size),
			100% 100%,
			42% 42%;
		mask-position:
			center,
			0 0,
			calc(var(--px) * 0.12) calc(var(--py) * 0.12);
		mask-repeat: no-repeat, no-repeat, repeat;
		mask-composite: intersect;
	}
	.cosmos .grain {
		opacity: 1;
	}
	.aurora .grain {
		opacity: 0.4;
	}

	@media (prefers-reduced-motion: reduce) {
		.rainbow,
		.glare,
		.grain {
			transition: none;
		}
	}
</style>
