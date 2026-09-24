// Runs the sticker migrations against a throwaway in-process Postgres
// (PGlite) built from the *live* schema, then the sticker tests.
//
//   pnpm db:test:stickers
//
// Order: auth shim → storage shim → supabase/dev/live_schema_20260923.sql
// (what the live project actually looks like) → every migration newer than
// LIVE_BASELINE → supabase/dev/test_stickers.sql. Needs no local Postgres;
// PGlite is Postgres compiled to WASM. Each file runs in one transaction, the
// way `supabase db push` applies a migration.
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const LIVE_BASELINE = '20260923999999';
const root = new URL('../supabase/', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

const db = new PGlite();
const files = [
	'dev/auth_shim.sql',
	'dev/storage_shim.sql',
	'dev/live_schema_20260923.sql',
	...readdirSync(new URL('migrations/', root))
		.filter((f) => f.endsWith('.sql') && f.slice(0, 14) > LIVE_BASELINE)
		.sort()
		.map((f) => `migrations/${f}`),
	'dev/test_stickers.sql'
];

for (const file of files) {
	const sql = read(file);
	try {
		if (file.startsWith('dev/test')) await db.exec(sql);
		else await db.transaction((tx) => tx.exec(sql));
		console.log(`ok   ${file}`);
	} catch (e) {
		console.log(`FAIL ${file}\n     ${e.message}${e.where ? `\n     where: ${e.where}` : ''}`);
		process.exit(1);
	}
}
console.log('all sticker schema checks passed');
