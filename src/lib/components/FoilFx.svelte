<script lang="ts">
	import type { Sticker, StickerFoil } from '$lib/types';

	/**
	 * The card's own holo effect (CardShell's `.holo`/`.glint`) revived for
	 * stickers, at two tiers: glitter holds its grain still; holo also drifts
	 * it — the parallax version that was tried and shelved for the card face
	 * (see docs/DESIGN.md). On the card that drift is driven by the real drag
	 * tilt (`lx`/`gx`/`gy` passed in); on the flat sticker grid there is no
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

	// A same-glyph SVG <text>, used purely as a mask: the browser rasterizes
	// its ink coverage regardless of the emoji's own colours, giving an alpha
	// shape that roughly matches what StickerGlyph actually draws. The
	// explicit emoji font stack matters here specifically: this SVG is
	// rasterized as a standalone image resource rather than through the
	// page's normal text layout, and at least one engine has been seen to
	// skip its usual automatic emoji-font fallback in that isolated context,
	// substituting a generic missing-glyph shape for the character instead.
	// Naming the system emoji fonts directly sidesteps that fallback step.
	function glyphMask(glyph: string): string {
		const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><text x='50' y='50' font-family="'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji','Twemoji Mozilla',sans-serif" font-size='70' text-anchor='middle' dominant-baseline='central'>${glyph}</text></svg>`;
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
	// Only .wash's mask-image varies per instance (one layer: the icon); .grain
	// stays a fixed two-layer expression (icon ∩ grain texture) in the
	// stylesheet below, so it only needs the icon slotted in here too.
	const washMaskStyle = $derived(iconMask ? `mask-image: ${iconMask};` : '');
	const grainMaskStyle = $derived(
		iconMask
			? `mask-image: ${iconMask}, url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='g' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  18 0 0 0 -12'/></filter><rect width='120' height='120' filter='url(%23g)'/></svg>");`
			: ''
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
			46% 46%;
		mask-position:
			center,
			calc(12% + var(--gx, 0%)) calc(18% + var(--gy, 0%));
		mask-repeat: no-repeat, repeat;
		/* A single value applies to every layer above: icon ∩ grain texture.
		   The -webkit- form is the same operation under Safari's older,
		   differently-named keyword — declaring both is the standard way to
		   get consistent masking across engines. */
		-webkit-mask-composite: source-in;
		mask-composite: intersect;
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
