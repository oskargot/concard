/**
 * The app's foil engine, on the web.
 *
 * concard-app lights every card and foiled sticker with one SkSL runtime
 * shader (`foil-sksl.ts`, copied here verbatim) run by react-native-skia. On
 * the web the same shader runs through CanvasKit — the very build
 * react-native-skia 2.6.2 ships (canvaskit-wasm 0.41.0, `bin/full`) — and this
 * module reproduces what `SkiaFoil.tsx`, `Foil.tsx` and `StickerFoil.tsx` feed
 * it: the same uniforms, the same texture matrices and sampling, the same
 * compositing. Those three files import React Native, so this is the one part
 * of the foil that is ported by hand; everything that decides a look is the
 * shared file.
 *
 * ## One GPU surface for the whole page
 *
 * A browser allows roughly sixteen WebGL contexts per page, and a binder shows
 * many more cards than that. So there is exactly one: a detached canvas with
 * one CanvasKit surface, grown to the largest drawing asked of it. Every card
 * and sticker is drawn into its top-left corner and copied straight out into
 * that card's own plain 2D canvas (`drawImage` of a WebGL canvas, in the same
 * task, so the drawing buffer is still intact). A card's canvas is therefore
 * an ordinary bitmap: it costs nothing while nothing changes, and the page can
 * hold as many as it likes. `scheduler.ts` decides what gets drawn when.
 *
 * CanvasKit is ~8 MB of wasm, so it is imported lazily, the first time a card
 * that needs it mounts. Until it arrives — or when WebGL is unavailable — a
 * card shows what the app shows without a Skia runtime: the plain gloss and
 * edge lip, and stickers without their foil.
 */

import type {
	BlendMode,
	Canvas,
	CanvasKit,
	GrDirectContext,
	Image as CkImage,
	Paint,
	RuntimeEffect,
	Shader,
	Surface
} from 'canvaskit-wasm';
import {
	buildSource,
	GLARE_REST,
	GLARE_TRAVEL,
	GLOSS_RADII,
	glossStops,
	LIGHT_DIRECTION,
	SKIA_RECIPE_NAMES,
	SKIA_RECIPES,
	SKIA_TEXTURE_LAYOUT,
	SKIA_TEXTURE_NAMES,
	type SkiaRecipeName,
	type SkiaTextureName
} from '$lib/app-card/foil/foil-sksl';
import { CARD_H, CARD_W } from '$lib/app-card/layout/spec';
import type { FoilKind, StickerFoil } from '$lib/app-card/tiers';
import { STICKER_BASE_WIDTH } from '$lib/stickers/constants';

/** concard-app's `FlipCard` TILT_RANGE: rx / ry of ±10° is full tilt. */
export const TILT_RANGE = 10;

/**
 * Which recipe each foil kind draws. Mirrors concard-app's
 * `src/card/foil/Foil.tsx` `RECIPE_FOR_KIND` (that file imports React Native,
 * so it can't be synced).
 */
export const RECIPE_FOR_KIND: Record<Exclude<FoilKind, 'none'>, SkiaRecipeName> = {
	glitter: 'sprayed',
	holo: 'linear',
	cosmic: 'stars',
	mosaic: 'mosaic'
};

/** The textures, as the app bundles them (copied by scripts/sync-card-spec.mjs). */
const TEXTURE_URLS: Record<SkiaTextureName, string> = {
	spray: '/foil/sprayed.png',
	stars: '/foil/stars.png',
	mosaic: '/foil/mosaic.png'
};

/** The light: `u_tilt` (the finger in screen space, −1..1, y down) and the idle clock. */
export interface Light {
	tilt: [number, number];
	/** Seconds; drives the idle drift. 0 holds it still. */
	time: number;
}

/**
 * FlipCard's `rx` (+up) / `ry` (+right), in degrees, as the shader's `u_tilt`
 * — exactly as SkiaFoil feeds it: `[ry, -rx] / TILT_RANGE`.
 */
export function tiltOf(rx: number, ry: number): [number, number] {
	return [ry / TILT_RANGE, -rx / TILT_RANGE];
}

/** How the gloss slides: Foil.tsx's `Glare` transform, in face fractions. */
export function glossShift(rx: number, ry: number): [number, number] {
	const [tx, ty] = tiltOf(rx, ry);
	return [tx * LIGHT_DIRECTION[0] * GLARE_TRAVEL[0], ty * LIGHT_DIRECTION[1] * GLARE_TRAVEL[1]];
}

/** A sticker placed on (or loosely lit as if on) a card, in that card's px. */
export interface StickerOnCard {
	width: number;
	height: number;
	cx: number;
	cy: number;
	/** Degrees, wobble included. */
	rotation: number;
	scale: number;
}

/** One sticker to draw: its art box (unscaled px), where it sits, and its foil. */
export interface Sprite {
	art: CkImage;
	/** The baked die cut; required for any foil. */
	mask: CkImage | null;
	/** The unscaled box the art fills, px. */
	w: number;
	h: number;
	cx: number;
	cy: number;
	rotation: number;
	scale: number;
	foil: StickerFoil;
}

/** Render-wide switches, for the parity harness. */
export interface EngineOptions {
	/**
	 * Tag the GL drawing buffer display-p3, as react-native-skia's web
	 * renderer does (`SkiaPictureView.web.js`). Off in production: on a phone
	 * the app's Skia draws sRGB; this only exists to compare against the app's
	 * web target pixel for pixel.
	 */
	p3: boolean;
}

const options: EngineOptions = { p3: false };

export function setEngineOptions(next: Partial<EngineOptions>) {
	Object.assign(options, next);
}

export class FoilEngine {
	readonly ck: CanvasKit;
	private readonly gl: HTMLCanvasElement;
	private readonly gr: GrDirectContext;
	private surface: Surface | null = null;
	private cw = 0;
	private ch = 0;
	private readonly effects = new Map<SkiaRecipeName, RuntimeEffect>();
	private readonly textures = new Map<SkiaTextureName, CkImage>();
	private readonly images = new Map<string, Promise<CkImage | null>>();
	private readonly paint: Paint;
	private readonly gloss: { colors: Float32Array[]; positions: number[] };
	lost = false;

	constructor(ck: CanvasKit, gl: HTMLCanvasElement, gr: GrDirectContext) {
		this.ck = ck;
		this.gl = gl;
		this.gr = gr;
		this.paint = new ck.Paint();
		this.paint.setAntiAlias(true);
		const stops = glossStops();
		this.gloss = {
			colors: stops.colors.map((c) => ck.parseColorString(c)),
			positions: stops.positions
		};
	}

	/** Compile every recipe and decode every texture. False if any fails. */
	async init(): Promise<boolean> {
		for (const name of SKIA_RECIPE_NAMES) {
			let error = '';
			const effect = this.ck.RuntimeEffect.Make(buildSource(name), (e) => (error = e));
			if (!effect) {
				console.warn(`[foil] SkSL for ${name} did not compile\n${error}`);
				return false;
			}
			this.effects.set(name, effect);
		}
		const decoded = await Promise.all(
			SKIA_TEXTURE_NAMES.map(async (name) => [name, await this.image(TEXTURE_URLS[name])] as const)
		);
		for (const [name, image] of decoded) {
			if (!image) return false;
			this.textures.set(name, image);
		}
		return true;
	}

	/**
	 * An image, decoded by CanvasKit itself as the app's `useImage` does
	 * (fetch + MakeImageFromEncoded), cached by url. The browser decodes it
	 * when CanvasKit can't.
	 */
	image(url: string): Promise<CkImage | null> {
		let hit = this.images.get(url);
		if (!hit) {
			hit = (async () => {
				try {
					const res = await fetch(url);
					if (!res.ok) return null;
					const bytes = new Uint8Array(await res.arrayBuffer());
					const image = this.ck.MakeImageFromEncoded(bytes);
					if (image) return image;
					const bitmap = await createImageBitmap(new Blob([bytes]));
					return this.ck.MakeImageFromCanvasImageSource(bitmap);
				} catch {
					return null;
				}
			})();
			this.images.set(url, hit);
		}
		return hit;
	}

	/** An already-decoded browser image (a rasterised SVG), as a CanvasKit image. */
	fromSource(source: CanvasImageSource): CkImage | null {
		try {
			return this.ck.MakeImageFromCanvasImageSource(source);
		} catch {
			return null;
		}
	}

	/** Make the shared surface at least `w × h` device px. */
	private ensure(w: number, h: number): Surface | null {
		if (this.surface && w <= this.cw && h <= this.ch) return this.surface;
		this.surface?.delete();
		this.cw = Math.max(this.cw, w, 1);
		this.ch = Math.max(this.ch, h, 1);
		this.gl.width = this.cw;
		this.gl.height = this.ch;
		this.surface = this.ck.MakeOnScreenGLSurface(
			this.gr,
			this.cw,
			this.ch,
			this.ck.ColorSpace.SRGB
		);
		const ctx = this.gl.getContext('webgl2') as
			(WebGL2RenderingContext & { drawingBufferColorSpace?: string }) | null;
		if (ctx && options.p3) ctx.drawingBufferColorSpace = 'display-p3';
		return this.surface;
	}

	/** Draw `w × h` device px with `fn`, then copy them into `target`. */
	private render(target: HTMLCanvasElement, w: number, h: number, fn: (c: Canvas) => void) {
		if (this.lost || w < 1 || h < 1) return;
		const surface = this.ensure(w, h);
		if (!surface) return;
		const canvas = surface.getCanvas();
		canvas.clear(this.ck.TRANSPARENT);
		canvas.save();
		canvas.clipRect([0, 0, w, h], this.ck.ClipOp.Intersect, false);
		fn(canvas);
		canvas.restore();
		surface.flush();
		if (target.width !== w) target.width = w;
		if (target.height !== h) target.height = h;
		const ctx = target.getContext('2d');
		if (!ctx) return;
		ctx.clearRect(0, 0, w, h);
		ctx.drawImage(this.gl, 0, 0, w, h, 0, 0, w, h);
	}

	/**
	 * `FoilFill`: the runtime shader with its uniforms and texture child.
	 * `width`/`height` are the light field (the card) in px.
	 */
	private foilShader(
		recipe: SkiaRecipeName,
		width: number,
		height: number,
		radius: number,
		light: Light,
		edge: 0 | 1,
		matrix?: number[],
		textureMatrix?: number[]
	): Shader | null {
		const ck = this.ck;
		const effect = this.effects.get(recipe);
		if (!effect) return null;
		const values: Record<string, number[]> = {
			u_resolution: [width, height],
			u_radius: [radius],
			u_time: [light.time],
			u_tilt: light.tilt,
			u_edge: [edge]
		};
		const uniforms = new Float32Array(effect.getUniformFloatCount());
		for (let i = 0; i < effect.getUniformCount(); i++) {
			const v = values[effect.getUniformName(i)];
			if (v) uniforms.set(v, effect.getUniform(i).slot);
		}

		const children: Shader[] = [];
		const textureName = SKIA_RECIPES[recipe].texture;
		if (textureName) {
			const texture = this.textures.get(textureName);
			if (!texture) return null;
			// SkiaFoil's <ImageShader rect fit="fill" matrix>: react-native-skia
			// maps the image onto the rect, then concatenates the matrix.
			const layout = SKIA_TEXTURE_LAYOUT[textureName];
			const anchored = textureMatrix !== undefined;
			let rect: [number, number, number, number];
			let tile = ck.TileMode.Clamp;
			if (layout.fit === 'face') {
				rect = [anchored ? -width / 2 : 0, anchored ? -height / 2 : 0, width, height];
			} else {
				const tileWidth = width / layout.tiles;
				rect = [0, 0, tileWidth, tileWidth / layout.aspect];
				tile = ck.TileMode.Repeat;
			}
			let local = ck.Matrix.multiply(
				ck.Matrix.translated(rect[0], rect[1]),
				ck.Matrix.scaled(rect[2] / texture.width(), rect[3] / texture.height())
			);
			if (textureMatrix) local = ck.Matrix.multiply(local, textureMatrix);
			// react-native-skia 2.6.2 builds a non-cubic ImageShader with
			// makeShaderCubic(tx, ty, FilterMode.Linear, MipmapMode.None) — that is,
			// cubic resampling with B = 1, C = 0. Matched exactly, soft flecks and all.
			children.push(texture.makeShaderCubic(tile, tile, 1, 0, local));
		}
		const shader = effect.makeShaderWithChildren(uniforms, children, matrix);
		for (const child of children) child.delete();
		return shader;
	}

	/**
	 * A card's tier foil over its face: SkiaFoil's canvas. `width`/`height`
	 * are the face in CSS px, `radius` its corner.
	 *
	 * Sized as react-native-skia's web canvas is (its `clientWidth`, rounded,
	 * times the pixel ratio) and drawn at `dpr` px per unit, so the pattern
	 * lands on the same device pixels as the app's web target.
	 */
	drawCardFoil(
		target: HTMLCanvasElement,
		recipe: SkiaRecipeName,
		width: number,
		height: number,
		radius: number,
		dpr: number,
		light: Light
	) {
		const w = Math.round(width) * dpr;
		const h = Math.round(height) * dpr;
		this.render(target, w, h, (canvas) => {
			const shader = this.foilShader(recipe, width, height, radius, light, 1);
			if (!shader) return;
			canvas.scale(dpr, dpr);
			this.paint.setShader(shader);
			this.paint.setBlendMode(this.ck.BlendMode.SrcOver);
			canvas.drawPaint(this.paint);
			this.paint.setShader(null);
			shader.delete();
		});
	}

	/**
	 * Stickers, in z order, into one bitmap covering `area` (card px): each is
	 * `DecoFoilCanvas` — the art, then a layer holding the die cut with the
	 * card's foil kept inside it (srcIn) and the card's gloss over that
	 * (srcATop). A plain sticker is just its art.
	 */
	drawSprites(
		target: HTMLCanvasElement,
		card: { width: number; height: number },
		area: { x: number; y: number; w: number; h: number },
		dpr: number,
		light: Light,
		sprites: Sprite[]
	) {
		const w = Math.ceil(area.w * dpr);
		const h = Math.ceil(area.h * dpr);
		this.render(target, w, h, (canvas) => {
			canvas.scale(dpr, dpr);
			canvas.translate(-area.x, -area.y);
			for (const s of sprites) this.drawSprite(canvas, card, s, light);
		});
	}

	private drawSprite(
		canvas: Canvas,
		card: { width: number; height: number },
		s: Sprite,
		light: Light
	) {
		const ck = this.ck;
		canvas.save();
		canvas.translate(s.cx, s.cy);
		canvas.rotate(s.rotation, 0, 0);
		canvas.scale(s.scale, s.scale);
		canvas.translate(-s.w / 2, -s.h / 2);
		const box = [0, 0, s.w, s.h];
		this.paint.setBlendMode(ck.BlendMode.SrcOver);
		// A foiled sticker's art is a Skia <Image> in the app (linear, no
		// mipmaps); a plain one is an <img>, which the browser downscales
		// smoothly — mipmaps get closest to that.
		canvas.drawImageRectOptions(
			s.art,
			[0, 0, s.art.width(), s.art.height()],
			box,
			ck.FilterMode.Linear,
			s.foil === 'none' ? ck.MipmapMode.Linear : ck.MipmapMode.None,
			this.paint
		);
		if (s.foil !== 'none' && s.mask) {
			const field = stickerField(ck, s.w, s.h, {
				width: card.width,
				height: card.height,
				cx: s.cx,
				cy: s.cy,
				rotation: s.rotation,
				scale: s.scale
			});
			canvas.saveLayer(undefined, null, null, 0);
			canvas.drawImageRectOptions(
				s.mask,
				[0, 0, s.mask.width(), s.mask.height()],
				box,
				ck.FilterMode.Linear,
				ck.MipmapMode.None,
				this.paint
			);
			const foil = this.foilShader(
				RECIPE_FOR_KIND[s.foil],
				field.width,
				field.height,
				field.width * 0.06,
				light,
				0,
				field.matrix,
				field.textureMatrix
			);
			if (foil) {
				this.paint.setShader(foil);
				this.paint.setBlendMode(ck.BlendMode.SrcIn);
				canvas.drawPaint(this.paint);
				foil.delete();
			}
			this.drawGloss(canvas, field, light, ck.BlendMode.SrcATop);
			this.paint.setShader(null);
			this.paint.setBlendMode(ck.BlendMode.SrcOver);
			canvas.restore();
		}
		canvas.restore();
	}

	/** StickerFoil's `Gloss`: the card's glare wash, in the card's space. */
	private drawGloss(canvas: Canvas, field: Field, light: Light, blend: BlendMode) {
		const ck = this.ck;
		const radiusX = GLOSS_RADII[0] * field.height;
		const squash = GLOSS_RADII[1] / GLOSS_RADII[0];
		const x = (GLARE_REST[0] + light.tilt[0] * LIGHT_DIRECTION[0] * GLARE_TRAVEL[0]) * field.width;
		const y = (GLARE_REST[1] + light.tilt[1] * LIGHT_DIRECTION[1] * GLARE_TRAVEL[1]) * field.height;
		const shader = ck.Shader.MakeRadialGradient(
			[x, y / squash],
			radiusX,
			this.gloss.colors,
			this.gloss.positions,
			ck.TileMode.Clamp
		);
		canvas.save();
		canvas.concat(field.matrix);
		canvas.scale(1, squash);
		this.paint.setShader(shader);
		this.paint.setBlendMode(blend);
		canvas.drawPaint(this.paint);
		canvas.restore();
		this.paint.setShader(null);
		shader.delete();
	}
}

interface Field {
	width: number;
	height: number;
	/** Light field (card px) → the sticker's own box. */
	matrix: number[];
	/** The sticker's frame in card px: its centre and rotation. */
	textureMatrix: number[];
}

/** StickerFoil's `stickerField`: how a `w × h` sticker box maps onto its card. */
function stickerField(ck: CanvasKit, w: number, h: number, place: StickerOnCard): Field {
	const theta = (place.rotation * Math.PI) / 180;
	const M = ck.Matrix;
	// canvas = centre + (1/s) R(-θ) (card - C)
	const matrix = M.multiply(
		M.translated(w / 2, h / 2),
		M.scaled(1 / place.scale, 1 / place.scale),
		M.rotated(-theta),
		M.translated(-place.cx, -place.cy)
	);
	const textureMatrix = M.multiply(M.translated(place.cx, place.cy), M.rotated(theta));
	return { width: place.width, height: place.height, matrix, textureMatrix };
}

/**
 * StickerFoil's `looseCard`: a sticker off any card is lit as if placed at the
 * centre of a card sized so that the sticker is STICKER_BASE_WIDTH of it.
 */
export function looseCard(w: number, h: number): StickerOnCard {
	const width = Math.max(w, h) / STICKER_BASE_WIDTH;
	const height = (width * CARD_H) / CARD_W;
	return { width, height, cx: width / 2, cy: height / 2, rotation: 0, scale: 1 };
}

let loading: Promise<FoilEngine | null> | null = null;

/** The engine, loaded on first use; null when this browser can't run it. */
export function loadEngine(): Promise<FoilEngine | null> {
	loading ??= boot().catch((e) => {
		console.warn('[foil] CanvasKit did not load; cards draw without foil.', e);
		return null;
	});
	return loading;
}

async function boot(): Promise<FoilEngine | null> {
	if (typeof document === 'undefined') return null;
	const gl = document.createElement('canvas');
	gl.width = gl.height = 1;
	// Probe first, so a browser without WebGL 2 never downloads the wasm.
	const probe = document.createElement('canvas').getContext('webgl2');
	if (!probe) return null;
	probe.getExtension('WEBGL_lose_context')?.loseContext();

	const [{ default: CanvasKitInit }, { default: wasmUrl }] = await Promise.all([
		import('canvaskit-wasm/bin/full/canvaskit.js'),
		import('canvaskit-wasm/bin/full/canvaskit.wasm?url')
	]);
	const ck = await CanvasKitInit({ locateFile: () => wasmUrl });
	// react-native-skia's defaults (CanvasKit's own), plus a drawing buffer
	// that survives being read back more than once per frame.
	const handle = ck.GetWebGLContext(gl, { preserveDrawingBuffer: 1 });
	const gr = handle ? ck.MakeWebGLContext(handle) : null;
	if (!gr) return null;
	const engine = new FoilEngine(ck, gl, gr);
	gl.addEventListener('webglcontextlost', () => (engine.lost = true));
	return (await engine.init()) ? engine : null;
}
