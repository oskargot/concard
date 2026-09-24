// Copies the generative fandom sticker renderer from concard-app, verbatim, so
// the web draws fandom stickers from the very same layout code as the app
// (CLAUDE.md's parity rule: shared layout files are imported, not rewritten).
//
//   node scripts/sync-sticker-renderer.mjs [path/to/concard-app]
//
// The only change is the app's `@/theme/tokens` import, which becomes the
// local `./fonts` (the same family names, served by static/fonts/stickers/).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(process.argv[2] ?? path.join(here, '../../../concard-app'));
const FILES = ['fandom-layout.ts', 'fandom-styles.ts', 'font-metrics.ts'];

for (const file of FILES) {
	const src = readFileSync(path.join(app, 'src/stickers', file), 'utf8');
	const out =
		`// Copied verbatim from concard-app/src/stickers/${file} by\n` +
		`// scripts/sync-sticker-renderer.mjs. Edit it there, then re-run the script.\n\n` +
		src.replace(`import { font } from '@/theme/tokens';`, `import { font } from './fonts';`);
	writeFileSync(path.join(here, '../src/lib/stickers', file), out);
	console.log(`synced ${file}`);
}
