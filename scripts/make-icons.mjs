// Renders static/icon.svg into the PNG sizes the web manifest and iOS need.
// Run: pnpm icons
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const svg = await readFile(new URL('../static/icon.svg', import.meta.url));
const outDir = fileURLToPath(new URL('../static/icons/', import.meta.url));
await mkdir(outDir, { recursive: true });

const targets = [
	{ file: 'icon-192.png', size: 192 },
	{ file: 'icon-512.png', size: 512 },
	{ file: 'apple-touch-icon.png', size: 180 }
];
for (const t of targets) {
	await sharp(svg)
		.resize(t.size, t.size)
		.png()
		.toFile(outDir + t.file);
}

// Maskable icons get cropped to a circle/squircle by the OS: pad the artwork
// so nothing important sits in the outer 10%.
const inner = await sharp(svg).resize(410, 410).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#121116' } })
	.composite([{ input: inner, gravity: 'centre' }])
	.png()
	.toFile(outDir + 'maskable-512.png');

console.log('icons written to static/icons/');
