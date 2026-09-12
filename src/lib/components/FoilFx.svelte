<script lang="ts">
	import type { StickerFoil } from '$lib/types';

	/**
	 * The card's own holo effect (CardShell's `.holo`/`.glint`) revived for
	 * stickers, at two tiers: glitter holds its grain still and only sweeps a
	 * light spot across it; holo also drifts the grain itself — the parallax
	 * version that was tried and shelved for the card face (see
	 * docs/DESIGN.md). On the card that drift is driven by the real drag tilt
	 * (`lx`/`ly`/`gx`/`gy` passed in); on the flat sticker grid there is no
	 * tilt to drive it, so it idles on a CSS loop instead.
	 */
	interface Props {
		foil: StickerFoil;
		/** 'panel' fills a square tile behind the glyph; 'halo' is a soft blurred
		 *  glow behind a die-cut sticker on the card face. */
		shape?: 'panel' | 'halo';
		/** Explicit light-spot position (0..100). Omit to idle-animate instead. */
		lx?: number;
		ly?: number;
		/** Explicit grain drift (holo only, -100..100). Omit to idle-animate. */
		gx?: number;
		gy?: number;
	}

	let { foil, shape = 'panel', lx, ly, gx, gy }: Props = $props();
	const idle = $derived(lx === undefined);
	const style = $derived(
		[
			lx !== undefined ? `--lx:${lx}%` : '',
			ly !== undefined ? `--ly:${ly}%` : '',
			gx !== undefined ? `--gx:${gx}%` : '',
			gy !== undefined ? `--gy:${gy}%` : ''
		]
			.filter(Boolean)
			.join(';')
	);
</script>

{#if foil !== 'none'}
	<div class="foilfx {shape} {foil}" class:idle aria-hidden="true" {style}>
		<div class="wash"></div>
		<div class="grain"></div>
	</div>
{/if}

<style>
	.foilfx {
		position: absolute;
		inset: 0;
		pointer-events: none;
		border-radius: inherit;
		overflow: hidden;
	}
	.foilfx.halo {
		inset: -55%;
		border-radius: 50%;
		filter: blur(4px);
	}

	.wash,
	.grain {
		position: absolute;
		inset: 0;
		background: linear-gradient(118deg, var(--holo-stops));
	}
	.wash {
		background-size: 240% 100%;
		background-position: var(--lx, 30%) 50%;
		mix-blend-mode: hard-light;
		opacity: 0.32;
	}
	.holo .wash {
		opacity: 0.42;
	}
	/*
	 * The halo sits inside the sticker's own box, which the die-cut rendering
	 * (Card.svelte's .sticker) already gives a z-index and thereby its own
	 * stacking context, with nothing opaque behind it to blend against —
	 * unlike the tile panel, whose parent has a real background colour. A
	 * blend mode there would just vanish, so the halo uses plain alpha
	 * instead: a real (if less subtle) glow rather than a colour blend.
	 */
	.halo .wash,
	.halo .grain {
		mix-blend-mode: normal;
	}
	.halo .wash {
		opacity: 0.7;
	}
	.halo .grain {
		opacity: 1;
	}
	.grain {
		mix-blend-mode: screen;
		opacity: 0.9;
		mask-image:
			radial-gradient(
				60% 55% at var(--lx, 30%) var(--ly, 40%),
				#000 0%,
				rgb(0 0 0 / 0.55) 45%,
				transparent 76%
			),
			url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='g' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  18 0 0 0 -12'/></filter><rect width='120' height='120' filter='url(%23g)'/></svg>");
		mask-size:
			100% 100%,
			46% 46%;
		mask-position:
			0 0,
			calc(12% + var(--gx, 0%)) calc(18% + var(--gy, 0%));
		mask-repeat: no-repeat, repeat;
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
