/**
 * A generative fandom sticker as SVG markup, from the layout code copied
 * verbatim from concard-app (fandom-layout.ts): the same layers in the same
 * order as the app's FandomSticker.tsx — shadow, white vinyl, die cut,
 * coloured outline, fill.
 *
 * One string serves both uses: the DOM sticker (`FandomSticker.svelte`) and
 * the bitmap the foil engine draws when a card's stickers are painted in one
 * canvas (`silhouette` is then its die cut, for masking the foil, and the
 * fonts travel inside the SVG so it rasterises in the right typeface).
 */

import { layoutFandomSticker, stickerHeight, type FandomLayout } from './fandom-layout';
import { recipeFor } from './fandom-styles';
import type { FandomStyleCategory } from './types';

export interface FandomSvg {
	layout: FandomLayout;
	width: number;
	height: number;
}

/** The layout at `width` px, or null when the label can't be laid out. */
export function fandomSvgLayout(
	label: string,
	styleCategory: FandomStyleCategory,
	width: number
): FandomSvg | null {
	if (width <= 1) return null;
	const layout = layoutFandomSticker(label, recipeFor(styleCategory), width);
	return layout ? { layout, width, height: stickerHeight(layout, width) } : null;
}

const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function vinyl(layout: FandomLayout, fill: string): string {
	return [...layout.bars, ...layout.joins]
		.map(
			(r) =>
				`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${r.rx}" fill="${fill}"/>`
		)
		.join('');
}

function letters(layout: FandomLayout, fill: string, stroke: string, strokeWidth: number): string {
	return layout.lines
		.map(
			(line) =>
				`<text x="${line.x}" y="${line.baseline}" font-family="${esc(layout.fontFamily)}" font-size="${layout.fontSize}" letter-spacing="${layout.letterSpacing}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round" stroke-miterlimit="2">${esc(line.text)}</text>`
		)
		.join('');
}

/**
 * The sticker's SVG. `pixelWidth`/`pixelHeight` set the rendered size (the
 * viewBox keeps the drawing); `fontCss` embeds @font-face rules for
 * rasterising; `silhouette` draws only the white die cut.
 */
export function fandomSvgMarkup(
	svg: FandomSvg,
	opts: {
		label?: string;
		pixelWidth?: number;
		pixelHeight?: number;
		fontCss?: string;
		silhouette?: boolean;
	} = {}
): string {
	const { layout } = svg;
	const vb = layout.viewBox;
	const t = `translate(${layout.origin.x} ${layout.origin.y}) rotate(${layout.rotation}) skewX(${layout.skewX}) translate(${-layout.origin.x} ${-layout.origin.y})`;
	const body = opts.silhouette
		? `${vinyl(layout, '#fff')}${letters(layout, '#fff', '#fff', layout.whiteStroke)}`
		: `<g transform="translate(${layout.shadow.dx} ${layout.shadow.dy})">${vinyl(layout, layout.shadow.color)}${letters(layout, layout.shadow.color, layout.shadow.color, layout.whiteStroke)}</g>` +
			vinyl(layout, layout.dieCut) +
			letters(layout, layout.dieCut, layout.dieCut, layout.whiteStroke) +
			letters(layout, layout.outline, layout.outline, layout.colorStroke) +
			letters(layout, layout.fill, 'none', 0);
	const label = opts.label ? ` role="img" aria-label="${esc(opts.label)} fandom sticker"` : '';
	const style = opts.fontCss ? `<defs><style>${opts.fontCss}</style></defs>` : '';
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${opts.pixelWidth ?? svg.width}" height="${opts.pixelHeight ?? svg.height}" viewBox="${vb.x} ${vb.y} ${vb.width} ${vb.height}" overflow="visible"${label}>` +
		`${style}<g transform="${t}">${body}</g></svg>`
	);
}
