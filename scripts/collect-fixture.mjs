// Prints a real `collect_card()` response from the sticker migrations, for the
// app's no-Supabase collect path to replay (concard-app
// src/store/fixtures/collect-v4.json). Runs the same PGlite setup as
// db-test-pglite.mjs: auth + storage shims, the live schema, the migrations.
//
//   node scripts/collect-fixture.mjs > ../../concard-app/src/store/fixtures/collect-v4.json
//
// The deco stickers get the asset paths of the app's bundled fixture bakes, so
// the replayed card draws real art offline.
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../supabase/', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const db = new PGlite();
for (const f of ['dev/auth_shim.sql', 'dev/storage_shim.sql', 'dev/live_schema_20260923.sql']) {
	await db.exec(read(f));
}
for (const f of readdirSync(new URL('migrations/', root))
	.filter((f) => f.endsWith('.sql') && f.slice(0, 14) > '20260923999999')
	.sort()) {
	await db.transaction((tx) => tx.exec(read(`migrations/${f}`)));
}

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const CARD = '00000000-0000-0000-0000-0000000000ca';
const art = (id, hash, aspect) =>
	`update public.stickers set full_path = '${id}/${hash}-full.webp', mask_path = '${id}/${hash}-mask.webp', thumb_path = '${id}/${hash}-thumb.webp', art_aspect = ${aspect} where id = '${id}';`;

await db.exec(`
	${art('star', '419318a559454a45', 1.0404)}
	${art('sparkles', 'd58d3f069fac5fa1', 1.0332)}
	${art('heart', 'da7b377662132abd', 1.0764)}
	insert into auth.users (id, email) values ('${A}', 'a@example.com'), ('${B}', 'b@example.com');
	set role authenticated;
	select set_config('request.jwt.claim.sub', '${A}', false);
	insert into public.profiles (id, username, display_name, bio) values ('${A}', 'pixelpal', 'Pixel Pal', 'Draws tiny robots. Ask me about my sketchbook.');
	insert into public.cards (id, owner_id, title, bio, style, affiliation, affiliation_x, affiliation_y)
		values ('${CARD}', '${A}', 'Pixel Pal', 'Draws tiny robots. Ask me about my sketchbook.', '{"bg":"sky","frame":"holo","photo_shape":"arch"}', 'scifi', 0.8, 0.86);
	reset role;
	insert into public.sticker_inventory (owner_id, sticker_id, foil, quantity) values ('${A}', 'star', 'glitter', 1), ('${A}', 'heart', 'holo', 1);
	set role authenticated;
	insert into public.sticker_placements (card_id, sticker_id, x, y, rotation, scale, z_index, foil, size) values
		('${CARD}', 'star', 0.2, 0.2, -8, 1.1, 1, 'glitter', 0.24),
		('${CARD}', 'heart', 0.74, 0.5, 10, 0.9, 2, 'holo', 0.24),
		('${CARD}', 'sparkles', 0.3, 0.62, 0, 1, 3, 'none', 0.24);
	select set_config('request.jwt.claim.sub', '${B}', false);
	insert into public.profiles (id, username, display_name) values ('${B}', 'collector', 'Collector');
`);
const { rows } = await db.query(`select public.collect_card('pixelpal') as r`);
process.stdout.write(JSON.stringify(rows[0].r, null, '\t') + '\n');
