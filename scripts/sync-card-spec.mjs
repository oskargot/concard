// Copies the card's shared code from concard-app, verbatim, so the web card is
// laid out, coloured and lit by the very same modules as the app's (CLAUDE.md
// in concard-app: shared layout files are imported, not rewritten).
//
//   node scripts/sync-card-spec.mjs [path/to/concard-app]
//
// Every file here is React-Native-free in the app on purpose. The only change
// made on the way over is to import paths, listed in REWRITES; everything else
// is byte-for-byte. Edit these in concard-app, then re-run this script.
//
// It also copies the binary assets those modules assume: the Outfit TTFs that
// outfit-metrics.ts was measured from (static/fonts/card/), and the foil
// textures the SkSL recipes sample (static/foil/).
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, '..');
const app = path.resolve(process.argv[2] ?? path.join(here, '../../../concard-app'));

/** app path → web path, both relative to their repo roots. */
const FILES = {
	'src/card/layout/spec.ts': 'src/lib/app-card/layout/spec.ts',
	'src/card/layout/front.ts': 'src/lib/app-card/layout/front.ts',
	'src/card/layout/back.ts': 'src/lib/app-card/layout/back.ts',
	'src/card/layout/crop.ts': 'src/lib/app-card/layout/crop.ts',
	'src/card/layout/measure.ts': 'src/lib/app-card/layout/measure.ts',
	'src/card/layout/outfit-metrics.ts': 'src/lib/app-card/layout/outfit-metrics.ts',
	'src/card/card-style.ts': 'src/lib/app-card/card-style.ts',
	'src/card/tiers.ts': 'src/lib/app-card/tiers.ts',
	'src/card/links.ts': 'src/lib/app-card/links.ts',
	'src/card/link-platforms.ts': 'src/lib/app-card/link-platforms.ts',
	'src/card/link-icons.ts': 'src/lib/app-card/link-icons.ts',
	'src/card/editor/fit-notices.ts': 'src/lib/app-card/editor/fit-notices.ts',
	'src/card/foil/foil-sksl.ts': 'src/lib/app-card/foil/foil-sksl.ts',
	'src/theme/palette.ts': 'src/lib/app-card/theme/palette.ts',
	'src/stickers/constants.ts': 'src/lib/stickers/constants.ts'
};

/**
 * The only edits: imports that point outside the copied set. `CardLink` is the
 * one type links.ts takes from the app's types.ts (which needs React Native
 * types), so the web's own `$lib/types` provides the same interface.
 */
const REWRITES = {
	'src/card/links.ts': [[`from './types';`, `from '$lib/types';`]],
	'src/card/foil/foil-sksl.ts': [[`from '../../theme/palette';`, `from '../theme/palette';`]]
};

const ASSETS = {
	'assets/fonts/Outfit-Regular.ttf': 'static/fonts/card/Outfit-Regular.ttf',
	'assets/fonts/Outfit-SemiBold.ttf': 'static/fonts/card/Outfit-SemiBold.ttf',
	'assets/fonts/Outfit-Bold.ttf': 'static/fonts/card/Outfit-Bold.ttf',
	'assets/foil/sprayed.png': 'static/foil/sprayed.png',
	'assets/foil/stars.png': 'static/foil/stars.png',
	'assets/foil/mosaic.png': 'static/foil/mosaic.png'
};

for (const [from, to] of Object.entries(FILES)) {
	let src = readFileSync(path.join(app, from), 'utf8');
	for (const [a, b] of REWRITES[from] ?? []) {
		if (!src.includes(a)) throw new Error(`${from}: expected import not found: ${a}`);
		src = src.replace(a, b);
	}
	const out =
		`// Copied verbatim from concard-app/${from} by\n` +
		`// scripts/sync-card-spec.mjs. Edit it there, then re-run the script.\n` +
		`// Linted in concard-app, under that repo's rules.\n/* eslint-disable */\n\n` +
		src;
	mkdirSync(path.dirname(path.join(web, to)), { recursive: true });
	writeFileSync(path.join(web, to), out);
	console.log(`synced ${to}`);
}

// The bundled sticker fixtures' data (the app's copy also require()s the
// images, so only the FIXTURE_STICKERS table comes over), for dev pages that
// draw the same stickers as the app; static/sticker-fixtures/ holds the bakes.
{
	const from = 'src/stickers/fixtures.generated.ts';
	const src = readFileSync(path.join(app, from), 'utf8');
	const table = src.match(/export interface FixtureSticker \{[\s\S]*?\n\];\n/);
	if (!table) throw new Error(`${from}: FIXTURE_STICKERS not found`);
	const to = 'src/lib/stickers/fixtures.ts';
	writeFileSync(
		path.join(web, to),
		`// The FIXTURE_STICKERS table from concard-app/${from}, copied by\n` +
			`// scripts/sync-card-spec.mjs. Edit it there, then re-run the script.\n` +
			`// Linted in concard-app, under that repo's rules.\n/* eslint-disable */\n\n` +
			table[0]
	);
	console.log(`synced ${to}`);
}

for (const [from, to] of Object.entries(ASSETS)) {
	mkdirSync(path.dirname(path.join(web, to)), { recursive: true });
	copyFileSync(path.join(app, from), path.join(web, to));
	console.log(`copied ${to}`);
}
