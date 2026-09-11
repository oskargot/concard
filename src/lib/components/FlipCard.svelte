<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		front: Snippet;
		back: Snippet;
		flipped?: boolean;
		label?: string;
	}

	let { front, back, flipped = $bindable(false), label = 'Flip card' }: Props = $props();
</script>

<button
	type="button"
	class="flip"
	class:flipped
	aria-label={label}
	aria-pressed={flipped}
	onclick={() => (flipped = !flipped)}
>
	<div class="inner">
		<div class="side front">{@render front()}</div>
		<div class="side back">{@render back()}</div>
	</div>
</button>

<style>
	.flip {
		all: unset;
		display: block;
		width: 100%;
		perspective: 1600px;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	.flip:focus-visible {
		outline: 3px solid var(--color-accent, #f59e0b);
		outline-offset: 6px;
		border-radius: 12px;
	}
	.inner {
		position: relative;
		width: 100%;
		aspect-ratio: 5 / 7;
		transform-style: preserve-3d;
		transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	.flipped .inner {
		transform: rotateY(180deg);
	}
	.side {
		position: absolute;
		inset: 0;
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
	}
	.back {
		transform: rotateY(180deg);
	}
	@media (prefers-reduced-motion: reduce) {
		.inner {
			transition: none;
		}
	}
</style>
