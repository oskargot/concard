// Vendors the Noto emoji vector artwork that `pnpm stickers` bakes from into
// assets/emoji/. Run: pnpm emoji:fetch
//
// Why vendor instead of fetching at bake time: the bake should be reproducible
// and offline, and pinning a ref means upstream redrawing an emoji can't change
// what's already on people's cards. Bump REF deliberately.
//
// Why the vector sources and not the installed font: NotoColorEmoji.ttf is
// CBDT — embedded bitmaps with a single 109ppem strike and no outlines — so
// baking from it would upscale a 109px bitmap to our 400px artwork. The SVGs
// are the same drawings at full vector quality.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { STICKER_GLYPHS, notoFileName } from './sticker-glyphs.mjs';

const REF = 'v2.047';
const BASE = `https://raw.githubusercontent.com/googlefonts/noto-emoji/${REF}`;
const outDir = fileURLToPath(new URL('../assets/emoji/', import.meta.url));

await mkdir(outDir, { recursive: true });

async function get(path) {
	const res = await fetch(`${BASE}/${path}`);
	if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
	return Buffer.from(await res.arrayBuffer());
}

// The OFL requires the licence travel with the artwork we're redistributing.
await writeFile(outDir + 'LICENSE', await get('LICENSE'));
await writeFile(
	outDir + 'README.md',
	`# Vendored Noto emoji artwork

Source: https://github.com/googlefonts/noto-emoji (\`${REF}\`), \`svg/\`.
Copyright 2013 Google LLC, licensed under the SIL Open Font License 1.1 — see
\`LICENSE\`.

These are the drawings \`pnpm stickers\` bakes \`static/stickers/\` from; they are
not served to the browser. Refresh with \`pnpm emoji:fetch\`.
`
);

let fetched = 0;
for (const { id, glyph } of STICKER_GLYPHS) {
	const file = notoFileName(glyph);
	try {
		await readFile(outDir + file);
		continue; // already vendored
	} catch {
		/* not there yet */
	}
	await writeFile(outDir + file, await get(`svg/${file}`));
	console.log(`${id.padEnd(10)} ${glyph}  ${file}`);
	fetched++;
}

console.log(
	fetched ? `${fetched} emoji vendored to assets/emoji/` : 'assets/emoji/ already complete'
);
