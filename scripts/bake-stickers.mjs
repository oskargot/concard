// Bakes the emoji stickers in scripts/sticker-glyphs.mjs into finished die-cut
// artwork under static/stickers/. Run: pnpm stickers
//
// Why bake at all: the die cut used to be a 14-function `filter:` chain on every
// sticker (12 hard drop-shadows tracing the rim, plus two soft ones), re-run per
// element and re-rasterised on every frame of the card's tilt drag. Baked, a
// sticker is one <img> the browser decodes once and reuses as a texture for
// every copy on screen, with no filter at all.
//
// Each sticker emits two files:
//   <id>.webp       artwork + rim + shadows — what's drawn on the card
//   <id>.mask.webp  the artwork's alpha alone — what FoilFx masks the holo to
//
// The mask has to be a separate file: masking the foil with the display asset
// would bleed it into the soft lift shadow's alpha, and a holo halo floating
// around the sticker looks like a bug. It also fixes the old glyph mask, which
// guessed an SVG text baseline (`y='68' font-size='76'`) that could not line up
// with where a colour emoji actually draws — hence the off-centre holo. Same
// canvas and same artwork placement as the display asset, so they register
// exactly.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { STICKER_GLYPHS, notoFileName } from './sticker-glyphs.mjs';

// ---------------------------------------------------------------------------
// Geometry. Every length is taken from the `.sticker` / `.cut` rules in
// src/lib/components/Card.svelte and expressed as a fraction of the on-card
// sticker box (`.sticker`, 15.33cqw), so the bake reproduces what those filters
// drew rather than a fresh guess at it.
// ---------------------------------------------------------------------------
const BOX_CQW = 15.33; // .sticker { width: 15.33cqw }
const ART_OF_BOX = 0.86; // .cut :global(img) { width: 86% }
const RIM_OF_BOX = 0.7 / BOX_CQW; // --rim-w: 0.7cqw
const EDGE_BLUR_OF_BOX = 0.25 / BOX_CQW; // drop-shadow(0 0 0.25cqw …)
const LIFT_DY_OF_BOX = 1.0 / BOX_CQW; // drop-shadow(0 1cqw 1.6cqw …)
const LIFT_BLUR_OF_BOX = 1.6 / BOX_CQW;

const RIM_COLOR = { r: 0xfb, g: 0xf9, b: 0xf3 }; // --rim: #fbf9f3
const INK = { r: 23, g: 22, b: 27 }; // rgb(23 22 27), both soft shadows
const EDGE_ALPHA = 0.45;
const LIFT_ALPHA = 0.3;

// A sticker is 15.33cqw, so ~60px on a 400px-wide card; `scale` tops out at 3
// and phones run at DPR 3, so the artwork can be asked for ~470px at the very
// largest. 400 covers everything short of that worst case.
const ART = 392;
const CANVAS = 640; // artwork + room for the rim and shadows around it
// Copies of the silhouette, evenly spaced around a circle, unioned to dilate
// the alpha into the paper rim. The CSS used 12 (the most it could afford) and
// its comment notes 4 notched sharp points into a blunt double-bump; offline
// there's no reason to ration them, so a star's points stay points.
const RIM_COPIES = 64;
// Everything is composed at 2x and resized down at the end: composite offsets
// are whole pixels, so this buys sub-pixel rim placement and anti-aliases the
// seams where the copies union.
const SS = 2;

const BOX_PX = ART / ART_OF_BOX;
const px = (ofBox) => ofBox * BOX_PX;
// CSS's blur radius is twice the Gaussian standard deviation sharp wants.
const sigma = (ofBox) => px(ofBox) / 2;

const rimPx = px(RIM_OF_BOX);
const liftDyPx = px(LIFT_DY_OF_BOX);
const pad = (CANVAS - ART) / 2;
// A Gaussian is spent by ~3 sigma; warn if the canvas would clip a shadow
// somewhere it's still visible rather than silently cropping it.
const liftReach = rimPx + liftDyPx + 3 * sigma(LIFT_BLUR_OF_BOX);
if (liftReach > pad) {
	const lost = ((liftReach - pad) / sigma(LIFT_BLUR_OF_BOX)).toFixed(1);
	console.warn(
		`note: ${pad}px of padding clips the lift shadow's last ${lost} sigma ` +
			`(needs ${liftReach.toFixed(1)}px for a full 3) — invisible, but raise CANVAS if it shows.`
	);
}

const C = CANVAS * SS;
const A = ART * SS;
const artOffset = Math.round((C - A) / 2);
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

const srcDir = fileURLToPath(new URL('../assets/emoji/', import.meta.url));
const outDir = fileURLToPath(new URL('../static/stickers/', import.meta.url));

/** The artwork alone, rendered from vector at the supersampled size. */
async function renderArt(svg) {
	// Render from the vector at the size we actually need instead of rasterising
	// at the SVG's intrinsic 128px and scaling that up.
	//
	// The artwork is not inset to make room for the rim: the rim is a dilation
	// that grows outward past the art box into the canvas padding, and the
	// padding sized for the lift shadow (124px) dwarfs the rim (21px). Noto
	// draws some emoji nearly edge to edge — the cat's whiskers leave 4px of the
	// tile — and the rim still traces around them with room to spare. Flat edges
	// on a baked sticker (the rainbow's arc ends) are in the source drawing, not
	// a clipped rim.
	const intrinsic = await sharp(svg).metadata();
	const density = Math.ceil(72 * (A / Math.max(intrinsic.width, intrinsic.height)));
	return sharp(svg, { density })
		.resize(A, A, { fit: 'contain', background: transparent })
		.png()
		.toBuffer();
}

/** Raw one-channel alpha of an image, plus its dimensions. */
async function alphaOf(buf) {
	const { data, info } = await sharp(buf)
		.ensureAlpha()
		.extractChannel('alpha')
		.raw()
		.toBuffer({ resolveWithObject: true });
	return { data, width: info.width, height: info.height };
}

/**
 * A flat colour wearing someone else's alpha, scaled by `opacity` — what a
 * drop-shadow is: the source silhouette repainted in the shadow's colour.
 */
function tint(alpha, color, opacity = 1) {
	const scaled = Buffer.allocUnsafe(alpha.data.length);
	for (let i = 0; i < alpha.data.length; i++) scaled[i] = Math.round(alpha.data[i] * opacity);
	return sharp({
		create: { width: alpha.width, height: alpha.height, channels: 3, background: color }
	})
		.joinChannel(scaled, { raw: { width: alpha.width, height: alpha.height, channels: 1 } })
		.png()
		.toBuffer();
}

/** An empty canvas-sized layer. */
const blankCanvas = () =>
	sharp({ create: { width: C, height: C, channels: 4, background: transparent } });

/**
 * The paper rim: the silhouette stamped at `RIM_COPIES` points around a circle
 * of radius `rimPx` and unioned. A dilation contains the original, so the
 * result doubles as the silhouette both soft shadows are cast from.
 */
async function rimLayer(artBuf) {
	const silhouette = await tint(await alphaOf(artBuf), RIM_COLOR);
	const r = rimPx * SS;
	const copies = [];
	for (let i = 0; i < RIM_COPIES; i++) {
		const t = (i / RIM_COPIES) * 2 * Math.PI;
		copies.push({
			input: silhouette,
			left: artOffset + Math.round(Math.cos(t) * r),
			top: artOffset + Math.round(Math.sin(t) * r)
		});
	}
	return blankCanvas().composite(copies).png().toBuffer();
}

/** A blurred, optionally offset shadow of `alpha`, as a canvas-sized layer. */
async function shadowLayer(alpha, { blur, dy = 0, opacity }) {
	const blurred = await sharp(await tint(alpha, INK, opacity))
		.blur(blur * SS)
		.png()
		.toBuffer();
	if (!dy) return blurred;
	// Shifting down costs the bottom `dy` rows, which fall outside the canvas
	// anyway; crop them so the layer still fits the base sharp composites onto.
	const shift = Math.round(dy * SS);
	const cropped = await sharp(blurred)
		.extract({ left: 0, top: 0, width: C, height: C - shift })
		.png()
		.toBuffer();
	return blankCanvas()
		.composite([{ input: cropped, left: 0, top: shift }])
		.png()
		.toBuffer();
}

async function bake({ id, glyph }) {
	const file = notoFileName(glyph);
	let svg;
	try {
		svg = await readFile(srcDir + file);
	} catch {
		throw new Error(`${id}: assets/emoji/${file} is missing — run \`pnpm emoji:fetch\``);
	}

	const art = await renderArt(svg);
	const rim = await rimLayer(art);
	// Both soft shadows are cast by the artwork *plus* its rim, the way the CSS
	// chain cast each drop-shadow from the result of the ones before it.
	const cutAlpha = await alphaOf(rim);

	const composed = await blankCanvas()
		.composite([
			{
				input: await shadowLayer(cutAlpha, {
					blur: sigma(LIFT_BLUR_OF_BOX),
					dy: liftDyPx,
					opacity: LIFT_ALPHA
				})
			},
			{
				input: await shadowLayer(cutAlpha, { blur: sigma(EDGE_BLUR_OF_BOX), opacity: EDGE_ALPHA })
			},
			{ input: rim },
			{ input: art, left: artOffset, top: artOffset }
		])
		.png()
		.toBuffer();
	// Second pipeline on purpose: sharp resizes before it composites, whatever
	// order the calls come in, so downsampling here would shrink the base out
	// from under the layers.
	const display = await sharp(composed)
		.resize(CANVAS, CANVAS)
		.webp({ quality: 92, alphaQuality: 100, effort: 6 })
		.toFile(outDir + `${id}.webp`);

	// The foil mask reads alpha only, so the colour channels may as well be a
	// solid the encoder can throw away. Lossless: a lossy alpha edge would
	// fringe the holo.
	const maskComposed = await blankCanvas()
		.composite([
			{
				input: await tint(await alphaOf(art), { r: 0, g: 0, b: 0 }),
				left: artOffset,
				top: artOffset
			}
		])
		.png()
		.toBuffer();
	const mask = await sharp(maskComposed)
		.resize(CANVAS, CANVAS)
		.webp({ lossless: true, effort: 6 })
		.toFile(outDir + `${id}.mask.webp`);

	return { id, glyph, display: display.size, mask: mask.size };
}

await mkdir(outDir, { recursive: true });
const baked = [];
for (const sticker of STICKER_GLYPHS) baked.push(await bake(sticker));

// The component needs to know which stickers have baked artwork, and how much
// bigger than the sticker box the artwork sits (the canvas carries padding for
// the rim and shadows, so the <img> overflows the box to put the artwork itself
// back at 86%). Generated so the two can't drift apart.
const scale = Number(((CANVAS / ART) * ART_OF_BOX).toFixed(4));
await writeFile(
	fileURLToPath(new URL('../src/lib/sticker-art.ts', import.meta.url)),
	`// Generated by scripts/bake-stickers.mjs — run \`pnpm stickers\` to update.
// Do not edit by hand.

/** Stickers with baked die-cut artwork under static/stickers/. */
export const BAKED_STICKERS: ReadonlySet<string> = new Set([
${baked.map((b) => `\t'${b.id}'`).join(',\n')}
]);

/**
 * How much bigger than the sticker box a baked asset is drawn. The artwork
 * occupies ${((ART / CANVAS) * 100).toFixed(1)}% of its canvas — the rest is room for the rim and shadows —
 * so the image overflows its box by this much to land the artwork itself at
 * ${(ART_OF_BOX * 100).toFixed(0)}%, the size the unbaked path draws it at. The foil mask shares the
 * canvas, so it is drawn at this scale too and registers exactly.
 */
export const BAKED_ART_SCALE = ${scale};
`
);

const total = baked.reduce((n, b) => n + b.display + b.mask, 0);
for (const b of baked) {
	console.log(
		`${b.id.padEnd(10)} ${b.glyph}  ${String(Math.round(b.display / 1024)).padStart(3)}KB art  ` +
			`${String(Math.round(b.mask / 1024)).padStart(3)}KB mask`
	);
}
console.log(
	`\n${baked.length} stickers baked to static/stickers/ at ${CANVAS}px — ` +
		`${(total / 1024).toFixed(0)}KB total, drawn at ${(scale * 100).toFixed(2)}% of the sticker box`
);
