<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';

	export interface Tilt {
		rx: number;
		ry: number;
		dragging: boolean;
	}

	interface Props {
		front: Snippet<[Tilt]>;
		back?: Snippet<[Tilt]>;
		flipped?: boolean;
		/** Tap to flip. When false the card still tilts but never turns over. */
		canFlip?: boolean;
		label?: string;
	}

	let { front, back, flipped = $bindable(false), canFlip = true, label = 'Card' }: Props = $props();

	let rx = $state(0);
	let ry = $state(0);
	let dragging = $state(false);
	let reduceMotion = $state(false);

	const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
	const TAP_THRESHOLD_PX = 9;

	let start: { x: number; y: number; id: number } | null = null;
	let moved = 0;

	onMount(() => {
		const mq = matchMedia('(prefers-reduced-motion: reduce)');
		reduceMotion = mq.matches;
		const onChange = () => (reduceMotion = mq.matches);
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	});

	function down(e: PointerEvent) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		start = { x: e.clientX, y: e.clientY, id: e.pointerId };
		moved = 0;
		dragging = true;
		// capture so a drag that leaves the card still tracks
		(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
	}
	function move(e: PointerEvent) {
		if (!start || e.pointerId !== start.id) return;
		const dx = e.clientX - start.x;
		const dy = e.clientY - start.y;
		moved = Math.max(moved, Math.hypot(dx, dy));
		if (reduceMotion) return;
		ry = clamp(dx / 5, -22, 22);
		rx = clamp(-dy / 6, -18, 18);
	}
	function up(e: PointerEvent) {
		if (!start || e.pointerId !== start.id) return;
		const tap = moved < TAP_THRESHOLD_PX;
		start = null;
		dragging = false;
		rx = 0;
		ry = 0;
		if (tap && canFlip) flipped = !flipped;
	}
	function key(e: KeyboardEvent) {
		if (!canFlip) return;
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			flipped = !flipped;
		}
	}

	const transform = $derived(`rotateY(${flipped ? 180 + ry : ry}deg) rotateX(${rx}deg)`);
</script>

<!-- role is 'button' whenever tabindex is set; the checker can't see the pairing -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="flip"
	class:flipped
	class:dragging
	class:reduce={reduceMotion}
	role={canFlip ? 'button' : 'presentation'}
	tabindex={canFlip ? 0 : undefined}
	aria-pressed={canFlip ? flipped : undefined}
	aria-label={canFlip ? label : undefined}
	onpointerdown={down}
	onpointermove={move}
	onpointerup={up}
	onpointercancel={up}
	onkeydown={key}
>
	<div class="inner" style="transform: {transform}">
		<div class="side front">{@render front({ rx, ry, dragging })}</div>
		{#if back}
			<div class="side back">{@render back({ rx, ry, dragging })}</div>
		{/if}
	</div>
</div>

<style>
	.flip {
		display: block;
		width: 100%;
		--turn: 0.6s;
		/*
		  The turn's easing is front-loaded, so the card passes edge-on at 36% of
		  the duration rather than halfway (measured off the computed matrix, not
		  guessed). The side swap below is timed to that crossing; at the halfway
		  point it would land ~80ms late and WebKit would flash the mirrored front.
		*/
		--turn-edge-on: calc(var(--turn) * 0.36);
		perspective: 1600px;
		cursor: pointer;
		touch-action: none;
		-webkit-tap-highlight-color: transparent;
		user-select: none;
		-webkit-user-select: none;
	}
	.flip[role='presentation'] {
		cursor: grab;
	}
	.flip:focus-visible {
		outline: 3px solid var(--color-holo, #b9c9ff);
		outline-offset: 8px;
		border-radius: 12px;
	}
	.inner {
		position: relative;
		width: 100%;
		aspect-ratio: 5 / 7;
		transform-style: preserve-3d;
		transition: transform var(--turn) cubic-bezier(0.4, 0.1, 0.2, 1);
	}
	.dragging .inner {
		transition: transform 0.08s linear;
	}
	/*
	  Keeping the two faces apart takes three things, because each covers a case
	  the others miss.

	  Every card face contains separately-composited subtrees — the shell's
	  container-type, the fx layers' mix-blend-mode, the drop-shadow filters on
	  stickers. WebKit does not apply an ancestor's backface culling across
	  those, and it does not restyle them mid-animation either, so the front's
	  photo and bio painted over the back, mirrored, for the length of the turn.

	  So the load-bearing fix is geometric, not a style change: give the card a
	  real thickness. Each face sits 1px out from the middle along its own local
	  Z, which after the container's rotation puts whichever face you are looking
	  at nearer the viewer than the other. The compositor's depth sorting then
	  occludes the far face continuously, through the turn as well as at rest,
	  with nothing to recompute at any point. The faces are opaque and their
	  rounded corners line up, so the near one covers the far one exactly.

	  backface-visibility and the visibility swap stay as the belt to that
	  braces: they settle the resting state and keep the away side out of hit
	  testing and the accessibility tree. The swap is timed to the edge-on
	  crossing, where the card is a zero-width sliver, so nothing pops.
	*/
	.side {
		position: absolute;
		inset: 0;
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
		transition: visibility 0s linear var(--turn-edge-on);
	}
	.front {
		transform: translateZ(1px);
	}
	.back {
		transform: rotateY(180deg) translateZ(1px);
		visibility: hidden;
	}
	.flipped .front {
		visibility: hidden;
	}
	.flipped .back {
		visibility: visible;
	}
	.reduce .inner,
	.reduce .side {
		transition: none;
	}
	@media (prefers-reduced-motion: reduce) {
		.inner,
		.side {
			transition: none;
		}
	}
</style>
