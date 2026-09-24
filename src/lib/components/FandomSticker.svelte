<script lang="ts" module>
	let nextId = 0;
</script>

<script lang="ts">
	/**
	 * A generative fandom sticker, drawn from the layout code copied verbatim
	 * from concard-app (src/lib/stickers/fandom-layout.ts) and painted with the
	 * same layers in the same order as the app's FandomSticker.tsx: shadow,
	 * white vinyl, die cut, coloured outline, fill. Same label, category and
	 * width in, same SVG out.
	 *
	 * Foil is masked *inside* the SVG by the sticker's own die cut: an SVG used
	 * as a CSS mask image can't load web fonts, so its letters would be cut in
	 * the wrong typeface. The foil look itself is the web's (see FoilFx) until
	 * the web card shares the app's foil engine.
	 */
	import { layoutFandomSticker, stickerHeight } from '$lib/stickers/fandom-layout';
	import { recipeFor } from '$lib/stickers/fandom-styles';
	import type { FandomStyleCategory } from '$lib/stickers/types';
	import type { StickerFoil } from '$lib/types';

	interface Props {
		label: string;
		styleCategory: FandomStyleCategory;
		/** Width in px — the layout depends on the real size, as in the app. */
		width: number;
		foil?: StickerFoil;
		/** Light position across the sticker, 0..100 (the card's tilt). */
		lx?: number;
	}

	let { label, styleCategory, width, foil = 'none', lx = 30 }: Props = $props();

	const id = `fandom-${nextId++}`;
	const layout = $derived(layoutFandomSticker(label, recipeFor(styleCategory), width));
	const height = $derived(layout ? stickerHeight(layout, width) : 0);
	const transform = $derived(
		layout
			? `translate(${layout.origin.x} ${layout.origin.y}) rotate(${layout.rotation}) skewX(${layout.skewX}) translate(${-layout.origin.x} ${-layout.origin.y})`
			: ''
	);
</script>

{#snippet vinyl(
	rects: { x: number; y: number; width: number; height: number; rx: number }[],
	fill: string
)}
	{#each rects as r, i (i)}
		<rect x={r.x} y={r.y} width={r.width} height={r.height} rx={r.rx} {fill} />
	{/each}
{/snippet}

{#snippet letters(fill: string, stroke: string, strokeWidth: number)}
	{#if layout}
		{#each layout.lines as line, i (i)}
			<text
				x={line.x}
				y={line.baseline}
				font-family={layout.fontFamily}
				font-size={layout.fontSize}
				letter-spacing={layout.letterSpacing}
				{fill}
				{stroke}
				stroke-width={strokeWidth}
				stroke-linejoin="round"
				stroke-linecap="round"
				stroke-miterlimit="2">{line.text}</text
			>
		{/each}
	{/if}
{/snippet}

{#if layout && width > 1}
	<svg
		{width}
		{height}
		viewBox="{layout.viewBox.x} {layout.viewBox.y} {layout.viewBox.width} {layout.viewBox.height}"
		role="img"
		aria-label="{label} fandom sticker"
	>
		{#if foil !== 'none'}
			<defs>
				<mask id="{id}-cut" maskUnits="userSpaceOnUse">
					<g {transform}>
						{@render vinyl(layout.bars, '#fff')}
						{@render vinyl(layout.joins, '#fff')}
						{@render letters('#fff', '#fff', layout.whiteStroke)}
					</g>
				</mask>
				<linearGradient
					id="{id}-holo"
					gradientUnits="objectBoundingBox"
					x1="0"
					y1="0"
					x2="1"
					y2="1"
					gradientTransform="translate({(lx - 50) / 100} 0)"
				>
					<stop offset="0" stop-color="#ffb3e0" />
					<stop offset="0.35" stop-color="#b9c9ff" />
					<stop offset="0.65" stop-color="#9ff0dc" />
					<stop offset="1" stop-color="#ffe7a8" />
				</linearGradient>
			</defs>
		{/if}
		<g {transform}>
			<g transform="translate({layout.shadow.dx} {layout.shadow.dy})">
				{@render vinyl(layout.bars, layout.shadow.color)}
				{@render vinyl(layout.joins, layout.shadow.color)}
				{@render letters(layout.shadow.color, layout.shadow.color, layout.whiteStroke)}
			</g>
			{@render vinyl(layout.bars, layout.dieCut)}
			{@render vinyl(layout.joins, layout.dieCut)}
			{@render letters(layout.dieCut, layout.dieCut, layout.whiteStroke)}
			{@render letters(layout.outline, layout.outline, layout.colorStroke)}
			{@render letters(layout.fill, 'none', 0)}
		</g>
		{#if foil !== 'none'}
			<rect
				class="foil {foil}"
				x={layout.viewBox.x}
				y={layout.viewBox.y}
				width={layout.viewBox.width}
				height={layout.viewBox.height}
				fill="url(#{id}-holo)"
				mask="url(#{id}-cut)"
			/>
		{/if}
	</svg>
{/if}

<style>
	svg {
		display: block;
		overflow: visible;
	}
	.foil {
		mix-blend-mode: screen;
		opacity: 0.5;
		pointer-events: none;
	}
	.foil.holo,
	.foil.cosmic,
	.foil.mosaic {
		opacity: 0.65;
	}
</style>
