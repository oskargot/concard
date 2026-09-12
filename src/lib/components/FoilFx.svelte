<script lang="ts">
	import type { Sticker, StickerFoil } from '$lib/types';

	/**
	 * The card's own holo effect (CardShell's `.holo`/`.glint`) revived for
	 * stickers, at two tiers: glitter holds its grain still and only sweeps a
	 * light spot across it; holo also drifts the grain itself — the parallax
	 * version that was tried and shelved for the card face (see
	 * docs/DESIGN.md). On the card that drift is driven by the real drag tilt
	 * (`lx`/`ly`/`gx`/`gy` passed in); on the flat sticker grid there is no
	 * tilt to drive it, so it idles on a CSS loop instead.
	 *
	 * Masked to the sticker's own silhouette (the artwork's alpha, or the
	 * emoji glyph's own shape) and painted over the artwork rather than
	 * behind it — so it reads as the sticker itself shimmering, not a glow
	 * sitting near it.
	 */
	interface Props {
		foil: StickerFoil;
		sticker: Sticker | undefined;
		/** How much of the box the icon actually fills, for mask sizing. */
		iconSize?: number;
		/** Explicit light-spot position (0..100). Omit to idle-animate instead. */
		lx?: number;
		ly?: number;
		/** Explicit grain drift (holo only, -100..100). Omit to idle-animate. */
		gx?: number;
		gy?: number;
	}

	let { foil, sticker, iconSize = 0.82, lx, ly, gx, gy }: Props = $props();
	const idle = $derived(lx === undefined);

	// A same-glyph SVG <text>, used purely as a mask: the browser rasterizes
	// its ink coverage regardless of the emoji's own colours, giving an alpha
	// shape that matches what StickerGlyph actually draws.
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
	const washMaskStyle = $derived(iconMask ? `mask-image: ${iconMask};` : '');
	const grainMaskStyle = $derived(
		iconMask
			? `mask-image: ${iconMask}, radial-gradient(60% 55% at var(--lx, 30%) var(--ly, 40%), #000 0%, rgb(0 0 0 / 0.55) 45%, transparent 76%), url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='g' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  18 0 0 0 -12'/></filter><rect width='120' height='120' filter='url(%23g)'/></svg>");`
			: ''
	);
	const style = $derived(
		[
			`--icon-size:${pct}`,
			lx !== undefined ? `--lx:${lx}%` : '',
			ly !== undefined ? `--ly:${ly}%` : '',
			gx !== undefined ? `--gx:${gx}%` : '',
			gy !== undefined ? `--gy:${gy}%` : ''
		]
			.filter(Boolean)
			.join(';')
	);
</script>

{#if foil !== 'none' && iconMask}
	<div class="foilfx {foil}" class:idle aria-hidden="true" {style}>
		<div class="wash" style={washMaskStyle}></div>
		<div class="grain" style={grainMaskStyle}></div>
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
		background: linear-gradient(118deg, var(--holo-stops));
		mask-position: center;
		mask-repeat: no-repeat;
	}
	.wash {
		background-size: 240% 100%;
		background-position: var(--lx, 30%) 50%;
		mix-blend-mode: hard-light;
		opacity: 0.55;
		mask-size: var(--icon-size) var(--icon-size);
	}
	.holo .wash {
		opacity: 0.7;
	}
	.grain {
		mix-blend-mode: screen;
		opacity: 0.95;
		mask-size:
			var(--icon-size) var(--icon-size),
			100% 100%,
			46% 46%;
		mask-position:
			center,
			0 0,
			calc(12% + var(--gx, 0%)) calc(18% + var(--gy, 0%));
		mask-repeat: no-repeat, no-repeat, repeat;
		mask-composite: intersect;
	}

	/* idle: no tilt input (the flat sticker grid), so animate the same
	   variables a drag would otherwise drive. Glitter only sweeps the spot;
	   holo also drifts the grain, on its own independent loop. */
	.idle.glitter .wash,
	.idle.holo .wash {
		animation: fx-sweep 4.5s ease-in-out infinite;
	}
	.idle.glitter .grain,
	.idle.holo .grain {
		animation: fx-spot 4.5s ease-in-out infinite;
	}
	.idle.holo .grain {
		animation:
			fx-spot 4.5s ease-in-out infinite,
			fx-drift 6.5s ease-in-out infinite;
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
	@keyframes fx-spot {
		0%,
		100% {
			--lx: 15%;
			--ly: 20%;
		}
		50% {
			--lx: 85%;
			--ly: 60%;
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
