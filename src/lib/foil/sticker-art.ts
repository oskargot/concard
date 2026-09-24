/**
 * Sticker art as the foil engine draws it: decoded CanvasKit images, cached.
 *
 * Deco art is the ingest's bakes, decoded the way the app decodes them. A
 * fandom sticker has no image — it is SVG text in the sticker fonts — so for
 * the engine it is rasterised: the same markup the DOM draws
 * (`fandom-svg.ts`), with its font embedded so the browser can render it as an
 * image, at the device size it will be drawn at. Its silhouette (the white die
 * cut) is rasterised the same way and is the mask its foil is kept inside.
 */

import type { Image as CkImage } from 'canvaskit-wasm';
import { fandomSvgLayout, fandomSvgMarkup } from '$lib/stickers/fandom-svg';
import type { FandomStyleCategory } from '$lib/stickers/types';
import type { FoilEngine } from './engine';

const fontCss = new Map<string, Promise<string>>();

/** An @font-face rule carrying one sticker font as a data URL. */
function embeddedFont(family: string): Promise<string> {
	let hit = fontCss.get(family);
	if (!hit) {
		hit = fetch(`/fonts/stickers/${family}.ttf`)
			.then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
			.then((buf) => {
				let bin = '';
				const bytes = new Uint8Array(buf);
				for (let i = 0; i < bytes.length; i += 0x8000) {
					bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
				}
				return `@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${btoa(bin)}) format('truetype');}`;
			})
			.catch(() => '');
		fontCss.set(family, hit);
	}
	return hit;
}

async function rasterise(engine: FoilEngine, markup: string): Promise<CkImage | null> {
	const img = new Image();
	img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
	try {
		await img.decode();
	} catch {
		return null;
	}
	return engine.fromSource(img);
}

const fandoms = new Map<string, Promise<{ art: CkImage; mask: CkImage } | null>>();

/**
 * A fandom sticker laid out at `width` px (its base size), rasterised at
 * `pixelScale` device px per px, with its die cut.
 */
export function fandomBitmaps(
	engine: FoilEngine,
	label: string,
	styleCategory: FandomStyleCategory,
	width: number,
	pixelScale: number
): Promise<{ art: CkImage; mask: CkImage } | null> {
	const key = `${label}|${styleCategory}|${width.toFixed(3)}|${pixelScale.toFixed(3)}`;
	let hit = fandoms.get(key);
	if (!hit) {
		hit = (async () => {
			const svg = fandomSvgLayout(label, styleCategory, width);
			if (!svg) return null;
			const size = {
				pixelWidth: Math.ceil(svg.width * pixelScale),
				pixelHeight: Math.ceil(svg.height * pixelScale)
			};
			const css = await embeddedFont(svg.layout.fontFamily);
			const [art, mask] = await Promise.all([
				rasterise(engine, fandomSvgMarkup(svg, { ...size, fontCss: css })),
				rasterise(engine, fandomSvgMarkup(svg, { ...size, fontCss: css, silhouette: true }))
			]);
			return art && mask ? { art, mask } : null;
		})();
		fandoms.set(key, hit);
	}
	return hit;
}
