<script lang="ts" module>
	import { glossGradient } from '$lib/app-card/foil/foil-sksl';

	/** Built once: the gradient only depends on the panel in foil-sksl.ts. */
	const GLOSS = glossGradient();
</script>

<script lang="ts">
	/**
	 * The card's light: concard-app's `Foil.tsx`, layer for layer.
	 *
	 *  - The holo stack (z 3, over the whole face, photo included; isolated so
	 *    its screen blend never reaches past the card): the tier's shader —
	 *    the app's SkSL, drawn by the shared foil engine into this card's own
	 *    canvas — screen-blended over the edge lip, a lit top and shadowed
	 *    bottom inset.
	 *  - The gloss (z 6, over everything on the face): the glare's white wash,
	 *    an ellipse sliding opposite the tilt by the same numbers the shader
	 *    lights its flecks with. Every card has it, plain ones included.
	 *
	 * Until the engine has loaded (or without WebGL) the shader layer is just
	 * empty, which is exactly the app's own fallback: the plain gloss and lip.
	 */
	import { onMount } from 'svelte';
	import { CARD_H, CARD_W, FRAME } from '$lib/app-card/layout/spec';
	import type { FoilKind } from '$lib/app-card/tiers';
	import { GLARE_REST, GLOSS_RADII } from '$lib/app-card/foil/foil-sksl';
	import { glossShift, RECIPE_FOR_KIND, tiltOf } from '$lib/foil/engine';
	import { foil } from '$lib/foil/scheduler';

	interface Props {
		kind: FoilKind;
		/** The card's width in px (0 until measured): the face is drawn from it. */
		width: number;
		rx?: number;
		ry?: number;
		intensity?: number;
		/** `thumb` holds the light still, so a grid never redraws every frame. */
		detail?: 'full' | 'thumb';
		/** Leave out the gloss (to compare with the app's web target, which can't draw it). */
		gloss?: boolean;
	}

	let {
		kind,
		width,
		rx = 0,
		ry = 0,
		intensity = 1,
		detail = 'full',
		gloss = true
	}: Props = $props();

	const recipe = $derived(kind === 'none' ? null : RECIPE_FOR_KIND[kind]);
	const scale = $derived(width / CARD_W);
	const faceW = $derived((CARD_W - FRAME.edge * 2) * scale);
	const faceH = $derived((CARD_H - FRAME.edge * 2) * scale);
	const tilt = $derived(tiltOf(rx, ry));
	const shift = $derived(glossShift(rx, ry));

	let dpr = $state(1);
	let reduceMotion = $state(false);
	onMount(() => {
		dpr = window.devicePixelRatio || 1;
		const mq = matchMedia('(prefers-reduced-motion: reduce)');
		reduceMotion = mq.matches;
	});
	const drift = $derived(detail === 'full' && !reduceMotion);

	// The face in design units (234 × 334): every length below is a multiple
	// of --u, the card's px per unit.
	const FACE_W = CARD_W - FRAME.edge * 2;
	const FACE_H = CARD_H - FRAME.edge * 2;
	const RX = GLOSS_RADII[0] * FACE_H;
	const RY = GLOSS_RADII[1] * FACE_H;
</script>

<div class="stack">
	<!-- the lip: a lit top edge and a shadowed bottom one, the card's thickness -->
	<div
		class="lip"
		style="box-shadow:
			inset 0 calc(var(--u) * {FACE_W * 0.012}) calc(var(--u) * {FACE_W *
			0.016}) calc(var(--u) * {-FACE_W * 0.008}) rgba(255,255,255,0.5),
			inset 0 calc(var(--u) * {-FACE_W * 0.012}) calc(var(--u) * {FACE_W *
			0.016}) calc(var(--u) * {-FACE_W * 0.008}) rgba(23,22,27,0.13);"
	></div>
	{#if recipe && width > 0}
		<div class="shader" style="opacity: {intensity}">
			<canvas
				use:foil={{
					// the drift yields to a real tilt and is gone past DRIFT_FADE (0.25)
					animate: drift && Math.hypot(tilt[0], tilt[1]) < 0.25,
					draw: (engine, canvas, time) =>
						engine.drawCardFoil(canvas, recipe, faceW, faceH, FRAME.faceRadius * scale, dpr, {
							tilt,
							time: drift ? time : 0
						})
				}}
			></canvas>
		</div>
	{/if}
</div>
{#if gloss}
	<div class="gloss">
		<div
			class="glare"
			style="left: calc(var(--u) * {GLARE_REST[0] * FACE_W -
				RX}); top: calc(var(--u) * {GLARE_REST[1] * FACE_H - RY}); width: calc(var(--u) * {RX *
				2}); height: calc(var(--u) * {RY * 2}); opacity: {intensity};
				background-image: {GLOSS};
				transform: translate(calc(var(--u) * {shift[0] * FACE_W}), calc(var(--u) * {shift[1] * FACE_H}));"
		></div>
	</div>
{/if}

<style>
	.stack,
	.gloss {
		position: absolute;
		inset: 0;
		overflow: hidden;
		border-radius: calc(var(--u) * 4);
		pointer-events: none;
	}
	.stack {
		/* scopes the screen blend below to the card */
		isolation: isolate;
		z-index: 3;
	}
	.gloss {
		z-index: 6;
	}
	.lip,
	.shader {
		position: absolute;
		inset: 0;
		border-radius: inherit;
	}
	.shader {
		overflow: hidden;
		mix-blend-mode: screen;
	}
	.shader canvas {
		display: block;
		width: 100%;
		height: 100%;
	}
	.glare {
		position: absolute;
	}
</style>
