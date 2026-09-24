<script lang="ts" module>
	import { getContext, setContext } from 'svelte';

	const RNWEB = Symbol('rnweb');

	/**
	 * Draw cards the way concard-app's *web target* can: react-native-web
	 * doesn't render `experimental_backgroundImage`, so there the edge band and
	 * the gloss are missing, and react-native-skia tags its canvases
	 * display-p3. Only the parity harness sets this, to diff against it.
	 */
	export function setRnWebReference(on: boolean) {
		setContext(RNWEB, on);
	}
	export function rnWebReference(): boolean {
		return getContext<boolean | undefined>(RNWEB) ?? false;
	}
</script>

<script lang="ts">
	/**
	 * The card's physical shell: concard-app's `CardShell.tsx`. The 8-unit edge
	 * band in the card's edge colour, radius 12 outside / 4 inside, the face,
	 * the foil stack over it, and an overlay slot outside the face clip.
	 *
	 * The card is designed in a fixed 250 × 350 unit space and drawn at any
	 * width: `--u` is one design unit (the card's width / 250, in container
	 * units, so it needs no JavaScript and renders on the server), and every
	 * length on the card is a multiple of it, exactly as the app multiplies
	 * every dimension by `width / 250`.
	 */
	import type { Snippet } from 'svelte';
	import { BGS, FRAMES, type CardStyle } from '$lib/card-style';
	import type { FoilKind } from '$lib/app-card/tiers';
	import Foil from './Foil.svelte';

	interface Props {
		style: CardStyle;
		/** Override the face colour: the back is always graphite. */
		faceColor?: string;
		/** Override the edge: the offline placeholder back's neutral edge. */
		edge?: string;
		/** Which foil to draw over the face. Omit for a face with no light at all. */
		foil?: FoilKind;
		rx?: number;
		ry?: number;
		intensity?: number;
		detail?: 'full' | 'thumb';
		/** The card's width in px, measured; 0 until it has been. */
		width?: number;
		editable?: boolean;
		onfacedown?: (event: PointerEvent) => void;
		children: Snippet;
		/** Drawn outside the face clip: stickers, and editor affordances. */
		overlay?: Snippet;
	}

	let {
		style,
		faceColor,
		edge,
		foil,
		rx = 0,
		ry = 0,
		intensity = 1,
		detail = 'full',
		width = $bindable(0),
		editable = false,
		onfacedown,
		children,
		overlay
	}: Props = $props();

	const rnweb = rnWebReference();
	const foilKind = $derived(style.frame === 'holo' && foil === 'none' ? 'holo' : foil);
	const band = $derived(rnweb ? 'transparent' : (edge ?? FRAMES[style.frame]));
</script>

<div class="shell" class:editable bind:clientWidth={width}>
	<div class="stage" style="--edge: {band}; --face: {faceColor ?? BGS[style.bg]};">
		<div
			class="band"
			role={editable ? 'presentation' : undefined}
			onpointerdown={editable ? onfacedown : undefined}
		>
			<div class="face">
				<div class="content">{@render children()}</div>
				{#if foilKind}
					<Foil kind={foilKind} {width} {rx} {ry} {intensity} {detail} gloss={!rnweb} />
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
	}
	.stage {
		/* one design unit: the card is 250 wide */
		--u: calc(100cqw / 250);
		position: relative;
		aspect-ratio: 250 / 350;
		width: 100%;
		user-select: none;
		-webkit-user-select: none;
	}
	.band {
		position: absolute;
		inset: 0;
		border-radius: calc(var(--u) * 12);
		background: var(--edge);
		box-shadow:
			0 calc(var(--u) * 11.7) calc(var(--u) * 25) rgba(23, 22, 27, 0.24),
			0 0 0 0.75px rgba(23, 22, 27, 0.35);
	}
	.editable .band {
		cursor: crosshair;
	}
	.face {
		position: absolute;
		inset: calc(var(--u) * 8);
		border-radius: calc(var(--u) * 4);
		background: var(--face);
		overflow: hidden;
	}
	.content {
		position: absolute;
		inset: 0;
	}
	.overlay {
		/* above everything on the face, tier foil included (spec §7) */
		position: absolute;
		inset: 0;
		z-index: 7;
		pointer-events: none;
	}
</style>
