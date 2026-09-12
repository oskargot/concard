<script lang="ts">
	import type { Sticker, StickerFoil } from '$lib/types';

	/**
	 * A foil finish for a sticker, at two tiers: glitter is a pale, sparkly
	 * dusting; holo is the fuller, saturated rainbow sweep, and also drifts
	 * its sparkle with tilt — the parallax effect that was tried and shelved
	 * for the card face itself (see docs/DESIGN.md). On the card that drift
	 * is driven by the real drag tilt (`lx`/`gx`/`gy` passed in); on the flat
	 * sticker grid there is no tilt to drive it, so it idles on a CSS loop.
	 *
	 * Painted over the artwork with `mix-blend-mode: normal` rather than a
	 * colour-math blend mode, so it reads as the sticker's own material
	 * having changed — foil replacing paper — rather than a tinted film laid
	 * over the original colours.
	 *
	 * Masked to a soft circle rather than the icon's exact silhouette: an
	 * earlier version re-rendered the sticker's own emoji character into a
	 * standalone SVG purely to trace its outline as a mask, which doesn't
	 * reliably agree, pixel for pixel, with how the real glyph is laid out
	 * elsewhere on the page — on a real device that showed up first as a
	 * wrongly-shaped mask, then as one that still wasn't quite centered. A
	 * plain circle is pure CSS geometry with no font involved anywhere, so
	 * it can't drift out of alignment the way a second glyph render can.
	 */
	interface Props {
		foil: StickerFoil;
		sticker: Sticker | undefined;
		/** How much of the (possibly enlarged, see outset) box the mask covers,
		 *  as a fraction of it. */
		iconSize?: number;
		/** Physically enlarges the effect's own box by this fraction on every
		 *  side (mask-size alone can't do this: it only zooms the mask within
		 *  its element's existing box, it can't paint past it) — so the
		 *  shimmer can bleed past the icon itself, e.g. over a die-cut
		 *  sticker's white rim. 0 leaves the box as its container's own size. */
		outset?: number;
		/** Explicit light position (0..100), driving the wash's sweep. Omit to
		 *  idle-animate instead. */
		lx?: number;
		/** Explicit grain drift (holo only, -100..100). Omit to idle-animate. */
		gx?: number;
		gy?: number;
	}

	let { foil, sticker, iconSize = 0.85, outset = 0, lx, gx, gy }: Props = $props();
	const idle = $derived(lx === undefined);

	// A soft-edged circle, feathering out to nothing — no shape-tracing, no
	// font, nothing that can misalign. An actual sticker image already has a
	// real alpha channel worth masking to instead.
	const CIRCLE_MASK = 'radial-gradient(circle, #000 55%, rgba(0,0,0,0.55) 75%, transparent 96%)';

	const iconMask = $derived(
		sticker?.image_url ? `url("${sticker.image_url}")` : sticker ? CIRCLE_MASK : null
	);

	const pct = $derived(`${iconSize * 100}%`);
	// The one mask-image both layers use is set inline (it's per-instance);
	// -webkit-mask-image is included alongside it for older engines that
	// never picked up the unprefixed property.
	const maskStyle = $derived(
		iconMask ? `-webkit-mask-image: ${iconMask}; mask-image: ${iconMask};` : ''
	);
	const style = $derived(
		[
			`--icon-size:${pct}`,
			outset ? `inset:${-outset * 100}%` : '',
			lx !== undefined ? `--lx:${lx}%` : '',
			gx !== undefined ? `--gx:${gx}%` : '',
			gy !== undefined ? `--gy:${gy}%` : ''
		]
			.filter(Boolean)
			.join(';')
	);
</script>

{#if foil !== 'none' && iconMask}
	<div class="foilfx {foil}" class:idle aria-hidden="true" {style}>
		<div class="wash" style={maskStyle}></div>
		<div class="grain" style={maskStyle}></div>
	</div>
{/if}

<style>
	.foilfx {
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
	}

	.wash,
	.grain {
		position: absolute;
		inset: 0;
		-webkit-mask-position: center;
		mask-position: center;
		-webkit-mask-repeat: no-repeat;
		mask-repeat: no-repeat;
		-webkit-mask-size: var(--icon-size) var(--icon-size);
		mask-size: var(--icon-size) var(--icon-size);
		/* normal, not a colour-math blend: this is meant to repaint the icon's
		   material, not tint its existing colours */
		mix-blend-mode: normal;
	}
	/* glitter: a pale, mostly-neutral sparkle — dust caught in the light,
	   the sticker's own colour still doing most of the work */
	.wash {
		background: linear-gradient(118deg, #fff 0%, #f4f0ff 30%, #fff 55%, #eef7ff 80%, #fff 100%);
		background-size: 240% 100%;
		background-position: var(--lx, 30%) 50%;
		opacity: 0.15;
	}
	/* holo: the full saturated rainbow sweep — unmistakably a different
	   material, not just a shinier version of the same one */
	.holo .wash {
		background: linear-gradient(118deg, var(--holo-stops));
		opacity: 0.8;
	}
	.grain {
		/* the tint and the sparkle texture, blended into one background stack —
		   background-blend-mode long predates mask-composite and is far more
		   consistently supported */
		background-image:
			linear-gradient(118deg, #fff 0%, #f4f0ff 30%, #fff 55%, #eef7ff 80%, #fff 100%),
			url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='g' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  18 0 0 0 -12'/></filter><rect width='120' height='120' filter='url(%23g)'/></svg>");
		background-size:
			100% 100%,
			46% 46%;
		background-position:
			center,
			calc(12% + var(--gx, 0%)) calc(18% + var(--gy, 0%));
		background-repeat: no-repeat, repeat;
		background-blend-mode: screen;
		opacity: 0.25;
	}
	.holo .grain {
		background-image:
			linear-gradient(118deg, var(--holo-stops)),
			url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='g' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  18 0 0 0 -12'/></filter><rect width='120' height='120' filter='url(%23g)'/></svg>");
		opacity: 0.75;
	}

	/* idle: no tilt input (the flat sticker grid), so animate the same
	   variables a drag would otherwise drive. Glitter's grain just holds
	   still; holo also drifts it, on its own loop. */
	.idle.glitter .wash,
	.idle.holo .wash {
		animation: fx-sweep 4.5s ease-in-out infinite;
	}
	.idle.holo .grain {
		animation: fx-drift 6.5s ease-in-out infinite;
	}
	@keyframes fx-sweep {
		0%,
		100% {
			background-position: 10% 50%;
		}
		50% {
			background-position: 90% 50%;
		}
	}
	@keyframes fx-drift {
		0%,
		100% {
			--gx: -14%;
			--gy: -10%;
		}
		50% {
			--gx: 14%;
			--gy: 10%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.idle .wash,
		.idle .grain {
			animation: none !important;
		}
	}
</style>
