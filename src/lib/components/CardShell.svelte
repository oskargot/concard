<script lang="ts">
	import type { Snippet } from 'svelte';
	import { BGS, FRAMES, inkFor, type CardStyle } from '$lib/card-style';

	interface Props {
		style: CardStyle;
		/** Override the face colour (the back is always ink). */
		faceColor?: string;
		/** Draw the holo wash, specular and edge layers. */
		fx?: boolean;
		rx?: number;
		ry?: number;
		dragging?: boolean;
		editable?: boolean;
		onfacedown?: (event: PointerEvent) => void;
		children: Snippet;
		/** Rendered outside the face clip, so it can hang over the edge (stickers). */
		overlay?: Snippet;
	}

	let {
		style,
		faceColor,
		fx = false,
		rx = 0,
		ry = 0,
		dragging = false,
		editable = false,
		onfacedown,
		children,
		overlay
	}: Props = $props();

	const ink = $derived(inkFor(style.bg));
	const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
	// the light sits opposite the tilt; default light is high
	const lx = $derived(clamp(50 - ry * 2.1, -15, 115));
	const ly = $derived(clamp(30 - rx * 2.4, -15, 115));
	const holoPos = $derived(50 + ry * 2.2);
</script>

<!--
  Sized by its container: whatever width the parent gives it, the card keeps a
  5:7 ratio and scales everything with cqw units, so the same shell renders a
  hero card and a binder thumbnail.
-->
<div
	class="shell shape-{style.shape}"
	class:dark={ink.dark}
	class:editable
	class:dragging
	style="
		--frame: {FRAMES[style.frame]};
		--bg: {faceColor ?? BGS[style.bg]};
		--ink: {ink.ink}; --mute: {ink.mute}; --body: {ink.body}; --wash: {ink.wash};
		--hatch-a: {ink.hatchA}; --hatch-b: {ink.hatchB};
		--lx: {lx}%; --ly: {ly}%; --holo-pos: {holoPos}%; --rx: {rx}; --ry: {ry};
	"
>
	<div class="stage">
		<div
			class="band"
			role={editable ? 'presentation' : undefined}
			onpointerdown={editable ? onfacedown : undefined}
		>
			<div class="face">
				<div class="content">{@render children()}</div>
				{#if fx}
					<div class="fx holo"></div>
					<div class="fx spec"></div>
					<div class="fx glint"></div>
					<div class="fx edge"></div>
				{/if}
			</div>
		</div>
		{#if overlay}
			<div class="overlay">{@render overlay()}</div>
		{/if}
	</div>
</div>

<style>
	.shell {
		container-type: inline-size;
		width: 100%;
		--band: max(1.67cqw, 3px);
		--hair: max(0.5cqw, 1px);
		--outer-r: 8.67cqw;
		--face-r: calc(var(--outer-r) - var(--band));
		--fx-t: 0.55s ease-out;
		font-family: Archivo, system-ui, sans-serif;
	}
	.shell.dragging {
		--fx-t: 0s;
	}
	.stage {
		position: relative;
		aspect-ratio: 5 / 7;
		width: 100%;
	}
	.band {
		position: absolute;
		inset: 0;
		background: var(--frame);
		border-radius: var(--outer-r);
		box-shadow:
			0 4.67cqw 10cqw rgb(23 22 27 / 0.24),
			0 0 0 0.75px rgb(23 22 27 / 0.35);
		user-select: none;
		-webkit-user-select: none;
	}
	.editable .band {
		cursor: crosshair;
	}
	.face {
		position: absolute;
		inset: var(--band);
		background: var(--bg);
		border-radius: var(--face-r);
		overflow: hidden;
		color: var(--ink);
	}
	.content {
		position: absolute;
		inset: 0;
		z-index: 2;
	}

	/* silhouettes */
	.shape-rect {
		--outer-r: 1cqw;
	}
	.shape-shaved {
		--outer-r: 1cqw;
	}
	.shape-shaved .band {
		clip-path: polygon(
			10cqw 0,
			calc(100% - 10cqw) 0,
			100% 10cqw,
			100% calc(100% - 10cqw),
			calc(100% - 10cqw) 100%,
			10cqw 100%,
			0 calc(100% - 10cqw),
			0 10cqw
		);
		box-shadow: none;
		filter: drop-shadow(0 4.67cqw 6cqw rgb(23 22 27 / 0.24));
	}
	.shape-shaved .face {
		--c: calc(10cqw - var(--band));
		clip-path: polygon(
			var(--c) 0,
			calc(100% - var(--c)) 0,
			100% var(--c),
			100% calc(100% - var(--c)),
			calc(100% - var(--c)) 100%,
			var(--c) 100%,
			0 calc(100% - var(--c)),
			0 var(--c)
		);
	}

	/* effect layers: above the content, under nothing */
	.fx {
		position: absolute;
		inset: 0;
		pointer-events: none;
		border-radius: inherit;
	}
	.holo {
		z-index: 3;
		background: linear-gradient(118deg, #ffb3e0, #b9c9ff, #9ff0dc, #ffe7a8, #ffb3e0);
		background-size: 260% 100%;
		background-position: var(--holo-pos) 50%;
		opacity: 0.2;
		mix-blend-mode: hard-light;
		transition: background-position var(--fx-t);
	}
	/* a faint smooth highlight keeps the sense of volume... */
	.spec {
		z-index: 4;
		background: radial-gradient(
			58% 42% at var(--lx) var(--ly),
			rgb(255 255 255 / 0.3),
			rgb(255 255 255 / 0.08) 46%,
			transparent 72%
		);
		mix-blend-mode: screen;
		transition:
			--lx var(--fx-t),
			--ly var(--fx-t);
	}
	/* ...and the shine itself is scattered: a soft holo tint revealed through
	   foil grain and a sparse sparkle grid, only inside the light spot. The
	   grain drifts a little with tilt so the glints twinkle as the card moves. */
	.glint {
		z-index: 4;
		background: linear-gradient(118deg, #ffb6dd, #b8c8ff, #a6f2dd, #ffe39a, #ffb6dd);
		background-size: 260% 100%;
		background-position: var(--holo-pos) 50%;
		/* mask = spot ∩ (grain ∪ sparkles): the spot is listed first and intersects
		   the union of the two textures beneath it */
		mask-image:
			radial-gradient(
				62% 46% at var(--lx) var(--ly),
				#000 0%,
				rgb(0 0 0 / 0.6) 36%,
				transparent 72%
			),
			url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='g' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' seed='11' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  16 0 0 0 -10.6'/></filter><rect width='160' height='160' filter='url(%23g)'/></svg>"),
			radial-gradient(circle, #000 0 0.36cqw, transparent 0.62cqw),
			radial-gradient(circle, rgb(0 0 0 / 0.85) 0 0.24cqw, transparent 0.5cqw);
		mask-size:
			100% 100%,
			34cqw 34cqw,
			7.3cqw 7.3cqw,
			4.1cqw 4.1cqw;
		mask-position:
			0 0,
			calc(var(--ry) * 0.9cqw) calc(var(--rx) * -0.7cqw),
			calc(1.9cqw + var(--ry) * 0.5cqw) calc(1.1cqw + var(--rx) * -0.4cqw),
			calc(var(--ry) * -0.3cqw) calc(2.3cqw + var(--rx) * 0.25cqw);
		mask-repeat: no-repeat, repeat, repeat, repeat;
		mask-composite: intersect, add, add;
		opacity: 0.95;
		transition:
			--lx var(--fx-t),
			--ly var(--fx-t),
			--rx var(--fx-t),
			--ry var(--fx-t),
			background-position var(--fx-t);
	}
	.edge {
		z-index: 5;
		box-shadow:
			inset 0 1.2cqw 1.6cqw -0.8cqw rgb(255 255 255 / 0.5),
			inset 0 -1.2cqw 1.6cqw -0.8cqw rgb(23 22 27 / 0.13);
	}

	.overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 6;
	}
</style>
