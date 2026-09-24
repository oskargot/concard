#!/usr/bin/env node
// Side by side: the web card against concard-app's own web target.
//
//   node scripts/card-parity.mjs [--app=http://localhost:8082] [--web=http://localhost:5173]
//
// Needs both dev servers running: concard-app's Expo web target (`npx expo
// start --web`, or its `npm run shots -- --keep …`) and this repo's `pnpm dev`
// (with PUBLIC_STICKER_ASSET_BASE=/sticker-fixtures/, as .env.example says).
// Drives the installed Chrome through playwright-core at 390 px @2x, like the
// app's scripts/shots.mjs, and writes to docs/card-port/:
//
//   geometry.json / geometry.md  every text line, icon and photo box of every
//                                gallery card, in design units, app vs web
//   <case>--app.png / --web.png  the same card from each client
//   <case>--diff.png             app | web | |difference| ×4, side by side
//   pixels.md                    mean difference and share of pixels that differ
//
// The web side is drawn with ?ref=rnweb: what the app's web target *can* draw
// (react-native-web renders no `experimental_backgroundImage`, so no edge
// gradient and no gloss; react-native-skia tags its canvases display-p3). That
// makes the remaining difference the port's, not the target's.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/card-port');
const flag = (name, fallback) =>
	process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const APP = flag('app', 'http://localhost:8082');
const WEB = flag('web', 'http://localhost:5173');
const CHROME = [
	process.env.CHROME_PATH,
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	'/usr/bin/google-chrome',
	'/usr/bin/chromium'
].find((p) => p && existsSync(p));

mkdirSync(OUT, { recursive: true });

/** In-page: every card on an app page (outermost w × 1.4w box), in document order. */
const APP_CARDS = `(() => {
	const widths = [106, 165, 320];
	const seen = [];
	for (const el of document.querySelectorAll('div')) {
		const r = el.getBoundingClientRect();
		if (!widths.some((w) => Math.abs(r.width - w) < 0.6) || Math.abs(r.height / r.width - 1.4) > 0.004) continue;
		if (seen.some((s) => s.contains(el))) continue;
		seen.push(el);
	}
	seen.forEach((el, i) => el.setAttribute('data-parity', String(i)));
	return seen.length;
})()`;

/** In-page: a card's text lines, icons and photo, in design units from its top-left. */
const MEASURE = `(sel) => {
	const card = document.querySelector(sel);
	const R = card.getBoundingClientRect();
	const u = R.width / 250;
	const rect = (r) => ({ x: +((r.x - R.x) / u).toFixed(2), y: +((r.y - R.y) / u).toFixed(2), w: +(r.width / u).toFixed(2), h: +(r.height / u).toFixed(2) });
	const out = { width: R.width, texts: [], icons: [], boxes: [] };
	for (const el of card.querySelectorAll('*')) {
		if (el.closest('[data-sticker], svg[role="img"][aria-label$="sticker"]')) continue;
		const cs = getComputedStyle(el);
		if (el.children.length === 0 && el.textContent.trim() && el.tagName !== 'text' && el.tagName !== 'title') {
			if (!/Outfit/.test(cs.fontFamily)) continue;
			out.texts.push({ text: el.textContent.trim(), font: cs.fontFamily.replace(/"/g, ''), size: +(parseFloat(cs.fontSize) / u).toFixed(2), ...rect(el.getBoundingClientRect()) });
		}
		if (el.tagName === 'svg' && el.getAttribute('viewBox') === '0 0 24 24') out.icons.push(rect(el.getBoundingClientRect()));
		// outlined boxes: the photo zone, the bio box, the pills
		if (parseFloat(cs.borderTopWidth) >= 1 && cs.borderTopStyle !== 'none' && el.tagName === 'DIV') {
			out.boxes.push({ radius: +(parseFloat(cs.borderTopLeftRadius) / u).toFixed(2), ...rect(el.getBoundingClientRect()) });
		}
	}
	return out;
}`;

/** The margin around each card shot, so overhanging stickers and the shadow are in frame. */
const M = 14;

/**
 * Screenshot a card. `match` is the app card's box: the web card is nudged by
 * the sub-pixel difference first, so both are rasterised at the same pixel
 * phase (text and hairlines otherwise land half a pixel apart).
 */
async function shootCard(page, selector, file, match) {
	// the web's fixed nav bar would cover cards near the bottom of the viewport
	await page.evaluate(() => {
		for (const nav of document.querySelectorAll('nav')) nav.style.display = 'none';
	});
	const el = page.locator(selector).first();
	await el.scrollIntoViewIfNeeded();
	if (match) {
		await el.evaluate((node) => {
			node.style.position = 'relative';
			node.style.left = '0px';
			node.style.top = '0px';
		});
		const before = await el.boundingBox();
		// the phase within a device pixel (2 per CSS px)
		const phase = (v) => v * 2 - Math.floor(v * 2);
		const nudge = (a, b) => {
			const d = phase(a) - phase(b);
			return (d > 0.5 ? d - 1 : d < -0.5 ? d + 1 : d) / 2;
		};
		const dx = nudge(match.x, before.x);
		const dy = nudge(match.y, before.y);
		await el.evaluate(
			(node, [x, y]) => {
				node.style.left = `${x}px`;
				node.style.top = `${y}px`;
			},
			[dx, dy]
		);
	}
	await page.waitForTimeout(900);
	const box = await el.boundingBox();
	await page.screenshot({
		path: file,
		clip: { x: box.x - M, y: box.y - M, width: box.width + M * 2, height: box.height + M * 2 }
	});
	return box;
}

/**
 * app | web | |diff|×4, plus the numbers. The web shot is aligned to the app's
 * first: the best whole-device-pixel shift within ±2 (screenshot clips round
 * their origin, so the two can land a pixel apart).
 */
async function diff(name) {
	const load = (side) =>
		sharp(path.join(OUT, `${name}--${side}.png`))
			.removeAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });
	const [A, B] = await Promise.all([load('app'), load('web')]);
	const w = Math.min(A.info.width, B.info.width) - 4;
	const h = Math.min(A.info.height, B.info.height) - 4;
	const at = (buf, W, x, y, c) => buf[(y * W + x) * 3 + c];
	// the numbers cover the card itself, not the page around it
	const m = M * 2;
	const score = (sx, sy, all) => {
		let sum = 0;
		let over = 0;
		let n = 0;
		const d = all ? Buffer.alloc(w * h * 3) : null;
		const step = all ? 1 : 3;
		for (let y = 0; y < h; y += step) {
			for (let x = 0; x < w; x += step) {
				const inside = x >= m && x < w - m && y >= m && y < h - m;
				let px = 0;
				for (let c = 0; c < 3; c++) {
					const v = Math.abs(
						at(A.data, A.info.width, x + 2, y + 2, c) -
							at(B.data, B.info.width, x + 2 + sx, y + 2 + sy, c)
					);
					if (inside) sum += v;
					px = Math.max(px, v);
					if (d) d[(y * w + x) * 3 + c] = Math.min(255, v * 4);
				}
				if (inside) {
					n++;
					if (px > 24) over++;
				}
			}
		}
		return { mean: sum / (n * 3), over: over / n, d };
	};
	let best = { sx: 0, sy: 0, mean: Infinity };
	for (let sy = -2; sy <= 2; sy++) {
		for (let sx = -2; sx <= 2; sx++) {
			const r = score(sx, sy, false);
			if (r.mean < best.mean) best = { sx, sy, mean: r.mean };
		}
	}
	const r = score(best.sx, best.sy, true);
	const crop = (buf, W, ox, oy) => {
		const out = Buffer.alloc(w * h * 3);
		for (let y = 0; y < h; y++)
			buf.copy(out, y * w * 3, ((y + oy) * W + ox) * 3, ((y + oy) * W + ox + w) * 3);
		return out;
	};
	const pad = 8;
	await sharp({ create: { width: w * 3 + pad * 2, height: h, channels: 3, background: '#000' } })
		.composite([
			{
				input: crop(A.data, A.info.width, 2, 2),
				raw: { width: w, height: h, channels: 3 },
				left: 0,
				top: 0
			},
			{
				input: crop(B.data, B.info.width, 2 + best.sx, 2 + best.sy),
				raw: { width: w, height: h, channels: 3 },
				left: w + pad,
				top: 0
			},
			{ input: r.d, raw: { width: w, height: h, channels: 3 }, left: (w + pad) * 2, top: 0 }
		])
		.png()
		.toFile(path.join(OUT, `${name}--diff.png`));
	return { mean: r.mean, over: r.over, shift: `${best.sx},${best.sy}` };
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({
	viewport: { width: 390, height: 844 },
	deviceScaleFactor: 2
});
const app = await ctx.newPage();
const web = await ctx.newPage();

async function open(page, url, isApp) {
	for (let attempt = 0; ; attempt++) {
		try {
			await page.goto(url, { waitUntil: 'networkidle', timeout: 240_000 });
			break;
		} catch (e) {
			// Windows sometimes runs out of socket buffers between many loads.
			if (attempt >= 4) throw e;
			await new Promise((r) => setTimeout(r, 20_000));
		}
	}
	if (isApp) {
		await page.waitForFunction(
			() => (document.getElementById('root')?.innerText ?? '').length > 0,
			null,
			{
				timeout: 240_000
			}
		);
	}
	await page.waitForTimeout(3000);
}

const pixels = [];

// 1 · The gallery: geometry of every card, and a few cards' pixels.
const WEB_IDS = [
	...['sharp', 'rounded', 'arch', 'circle'].map((s) => `shape-${s}`),
	...['112', '140', '196', '234'].map((s) => `divider-${s}`),
	...['0', '1', '4', '8'].map((s) => `links-${s}`),
	...['left', 'center', 'right'].map((s) => `align-${s}`),
	...['name', 'centre', 'pill'].map((s) => `fit-${s}`),
	...['silver', 'gold', 'holo', 'ink'].map((s) => `edge-${s}`),
	...['paper', 'blush', 'butter', 'cyan', 'violet', 'slate'].map((s) => `face-${s}`),
	...['0', '1', '2', '3'].map((s) => `tier-${s}`),
	...['qr', 'placeholder', 'record'].map((s) => `back-${s}`),
	...['0', '1', '2'].map((s) => `binder-${s}`)
];
await open(app, `${APP}/dev/cards`, true);
await open(web, `${WEB}/dev/cards?ref=rnweb&t=0`, false);
const count = await app.evaluate(APP_CARDS);
console.log(`app gallery: ${count} cards; web ids: ${WEB_IDS.length}`);
const geometry = [];
const report = ['# Geometry, app vs web (design units)', ''];
let worst = 0;
for (let i = 0; i < Math.min(count, WEB_IDS.length); i++) {
	const id = WEB_IDS[i];
	const [ga, gw] = await Promise.all([
		app.evaluate(`(${MEASURE})('[data-parity="${i}"]')`),
		web.evaluate(`(${MEASURE})('[data-card="${id}"]')`)
	]);
	const rows = [];
	const pool = [...gw.texts];
	for (const t of ga.texts) {
		const j = pool.findIndex((p) => p.text === t.text);
		if (j < 0) {
			rows.push({ text: t.text, app: t, web: null });
			continue;
		}
		const p = pool.splice(j, 1)[0];
		const dx = Math.max(...['x', 'y', 'w', 'h'].map((k) => Math.abs(p[k] - t[k])));
		worst = Math.max(worst, dx);
		rows.push({ text: t.text, app: t, web: p, delta: +dx.toFixed(2) });
	}
	for (const p of pool) rows.push({ text: p.text, app: null, web: p });
	const icons = ga.icons.map((r, k) => {
		const q = gw.icons[k];
		const dx = q ? Math.max(...['x', 'y', 'w', 'h'].map((key) => Math.abs(q[key] - r[key]))) : null;
		if (dx != null) worst = Math.max(worst, dx);
		return { app: r, web: q ?? null, delta: dx == null ? null : +dx.toFixed(2) };
	});
	// boxes: each app box against the nearest web box
	const boxes = ga.boxes.map((b) => {
		let best = null;
		for (const q of gw.boxes) {
			const d = Math.max(...['x', 'y', 'w', 'h'].map((k) => Math.abs(q[k] - b[k])));
			if (!best || d < best.d) best = { q, d };
		}
		if (best) worst = Math.max(worst, best.d);
		return { app: b, web: best?.q ?? null, delta: best ? +best.d.toFixed(2) : null };
	});
	geometry.push({ id, width: ga.width, texts: rows, icons, boxes });
	const maxDelta = Math.max(
		0,
		...rows.map((r) => r.delta ?? 0),
		...icons.map((r) => r.delta ?? 0),
		...boxes.map((r) => r.delta ?? 0)
	);
	const missing = rows
		.filter((r) => !r.app || !r.web)
		.map((r) => `${r.app ? 'web lacks' : 'app lacks'} “${r.text}”`);
	report.push(
		`- **${id}** (${ga.width}px): ${rows.length} text lines, ${icons.length} icons, ${boxes.length} boxes (app) / ${gw.boxes.length} (web), worst Δ ${maxDelta.toFixed(2)} u` +
			(missing.length ? ` — ${missing.join('; ')}` : '')
	);
}
report.splice(
	2,
	0,
	`Worst difference over every matched line and icon: **${worst.toFixed(2)} units**.`,
	''
);
writeFileSync(path.join(OUT, 'geometry.json'), JSON.stringify(geometry, null, 1));
writeFileSync(path.join(OUT, 'geometry.md'), report.join('\n') + '\n');
console.log(`geometry: worst ${worst.toFixed(2)} u`);

const GALLERY_SHOTS = [
	'shape-arch',
	'links-8',
	'align-center',
	'fit-pill',
	'face-slate',
	'back-qr',
	'back-record',
	'binder-2'
];
for (const id of GALLERY_SHOTS) {
	const i = WEB_IDS.indexOf(id);
	const box = await shootCard(
		app,
		`[data-parity="${i}"]`,
		path.join(OUT, `gallery-${id}--app.png`)
	);
	await shootCard(web, `[data-card="${id}"]`, path.join(OUT, `gallery-${id}--web.png`), box);
	pixels.push({ name: `gallery-${id}`, ...(await diff(`gallery-${id}`)) });
}

// 2 · Every foil, at rest and still (the app's foil lab in `thumb` idle).
await open(web, `${WEB}/dev/cards?ref=rnweb&t=0`, false);
await open(app, `${APP}/dev/foil-lab`, true);
await app.getByText('thumb', { exact: true }).first().click();
for (const kind of ['none', 'glitter', 'holo', 'cosmic', 'mosaic']) {
	await app.getByText(kind, { exact: true }).first().click();
	await app.waitForTimeout(1500);
	await app.evaluate(APP_CARDS);
	const box = await shootCard(app, '[data-parity="0"]', path.join(OUT, `foil-${kind}--app.png`));
	await shootCard(web, `[data-card="lab-${kind}"]`, path.join(OUT, `foil-${kind}--web.png`), box);
	pixels.push({ name: `foil-${kind}`, ...(await diff(`foil-${kind}`)) });
}

// 3 · Foiled stickers on a card, at a pinned tilt (the app's sticker lab).
for (const tilt of ['0.6,-0.6', '-0.8,0']) {
	await open(app, `${APP}/dev/stickers?tilt=${tilt}`, true);
	await open(web, `${WEB}/dev/cards?ref=rnweb&tilt=${tilt}`, false);
	const n = await app.evaluate(APP_CARDS);
	const tag = tilt.replace(/,/g, '_');
	const pairs = [
		['0', 'stickers-glitter-check', 'glitter-check'],
		[String(n - 1), 'stickers-rungs', 'rungs']
	];
	for (const [i, id, short] of pairs) {
		const box = await shootCard(
			app,
			`[data-parity="${i}"]`,
			path.join(OUT, `stickers-${short}-${tag}--app.png`)
		);
		await shootCard(
			web,
			`[data-card="${id}"]`,
			path.join(OUT, `stickers-${short}-${tag}--web.png`),
			box
		);
		pixels.push({ name: `stickers-${short}-${tag}`, ...(await diff(`stickers-${short}-${tag}`)) });
	}
}

// 4 · The production look (no rnweb reference): what the web actually ships.
await open(web, `${WEB}/dev/cards?tilt=0.6,-0.6`, false);
for (const id of [
	'tier-1',
	'tier-3',
	'stickers-glitter-check',
	'more-affiliation',
	'more-overflow'
]) {
	await shootCard(web, `[data-card="${id}"]`, path.join(OUT, `web-${id}.png`));
}

writeFileSync(
	path.join(OUT, 'pixels.md'),
	[
		'# Pixels, app web target vs web (?ref=rnweb)',
		'',
		'Mean |difference| per channel (0–255) and share of pixels with any channel off by more than 24.',
		'',
		'| case | mean | pixels off | aligned by (device px) |',
		'| --- | ---: | ---: | ---: |',
		...pixels.map(
			(p) => `| ${p.name} | ${p.mean.toFixed(2)} | ${(p.over * 100).toFixed(2)}% | ${p.shift} |`
		),
		''
	].join('\n')
);
for (const p of pixels)
	console.log(`${p.name}: mean ${p.mean.toFixed(2)}, off ${(p.over * 100).toFixed(2)}%`);
await browser.close();
