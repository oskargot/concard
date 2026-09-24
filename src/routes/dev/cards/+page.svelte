<script lang="ts">
	/**
	 * Dev only: every card look on fixture data, laid out to be compared card
	 * for card with concard-app's own galleries — its `/dev/cards` (same groups,
	 * same fixture, same 165 / 106 px widths), `/dev/foil-lab` (every foil on
	 * the silver / blush demo at 320) and `/dev/stickers` (its two sticker
	 * cards at 320) — plus the cases those don't show.
	 *
	 * Query params pin a state for screenshots (scripts/card-parity.mjs):
	 *   ?tilt=x,y   the light as the shader sees it, −1..1 each (0,0 = at rest)
	 *   ?t=s        pin the idle clock at s seconds (0 = the app's `thumb` stillness)
	 *   ?ref=rnweb  draw what the app's *web target* can: no edge gradient, no
	 *               gloss, display-p3 foil canvases (see CardShell)
	 * Sticker art is the app's fixture bakes (PUBLIC_STICKER_ASSET_BASE).
	 */
	import { page } from '$app/state';
	import Card from '$lib/components/Card.svelte';
	import CardBack from '$lib/components/CardBack.svelte';
	import CardShell, { setRnWebReference } from '$lib/components/CardShell.svelte';
	import StickerTile from '$lib/components/StickerTile.svelte';
	import {
		ALIGNMENTS,
		FRAME_KEYS,
		PHOTO_SHAPES,
		type BgKey,
		type CardStyle
	} from '$lib/card-style';
	import { photoHeightMax } from '$lib/app-card/layout/front';
	import { CARD_TIERS, FOIL_KINDS, foilForTier, STICKER_FOILS } from '$lib/app-card/tiers';
	import { STICKER_BASE_WIDTH } from '$lib/stickers/constants';
	import { DEMO_CARD, fixtureCatalog } from '$lib/demo-card';
	import { setEngineOptions } from '$lib/foil/engine';
	import { pinFoilClock } from '$lib/foil/scheduler';
	import type { CardLink, CardView, PlacedSticker, StickerFoil } from '$lib/types';

	const catalog = fixtureCatalog();
	const q = page.url.searchParams;
	const [tx, ty] = (q.get('tilt') ?? '0,0').split(',').map(Number);
	// u_tilt = [ry, -rx] / TILT_RANGE, so invert that here (as the app's lab does)
	const rx = -(Number.isFinite(ty) ? ty : 0) * 10;
	const ry = (Number.isFinite(tx) ? tx : 0) * 10;
	const rnweb = q.get('ref') === 'rnweb';
	setRnWebReference(rnweb);
	setEngineOptions({ p3: rnweb });
	const pinned = q.get('t');
	if (pinned !== null) pinFoilClock(Number(pinned) || 0);

	const HERO = 165;
	const BINDER = 106;
	const LAB = 320;

	const BG_SAMPLE: BgKey[] = ['paper', 'blush', 'butter', 'cyan', 'violet', 'slate'];
	const EIGHT_LINKS: CardLink[] = [
		{ url: 'https://instagram.com/pixelpastrycafe', handle: '@pixelpastrycafe' },
		{ url: 'https://bsky.app/profile/rafa.bsky.social', handle: '@rafa.bsky.social' },
		{ url: 'https://rafadraws.itch.io', handle: 'rafadraws' },
		{ url: 'https://oskargot.space', handle: 'oskargot.space' },
		{ url: 'https://twitch.tv/rafadraws', handle: 'rafadraws' },
		{ url: 'https://ko-fi.com/rafadraws', handle: 'rafadraws' },
		{ url: 'https://discord.gg/concard', handle: 'discord.gg/concard' },
		{ url: 'https://tiktok.com/@rafadraws', handle: '@rafadraws' }
	];
	const LONG_BIO =
		'Inks comics too slowly, sells stickers too cheaply. Table H14 all weekend — say hi and ask about the zine. Trades welcome, tea preferred!!';

	const v = (patch: Partial<CardView>, style: Partial<CardStyle> = {}): CardView => ({
		...DEMO_CARD,
		...patch,
		style: { ...DEMO_CARD.style, ...style }
	});

	interface Sample {
		id: string;
		label: string;
		view: CardView;
		width?: number;
		tier?: number;
		foil?: (typeof FOIL_KINDS)[number] | null;
		detail?: 'full' | 'thumb';
	}
	interface Group {
		id: string;
		title: string;
		samples: Sample[];
	}

	/** A plain sticker placement, as the app's sticker lab makes them. */
	const place = (
		sticker_id: string,
		x: number,
		y: number,
		foil: StickerFoil,
		extra: Partial<PlacedSticker> = {}
	): PlacedSticker => ({
		id: `${sticker_id}-${x}-${y}`,
		sticker_id,
		x,
		y,
		rotation: 0,
		scale: 1,
		z_index: 1,
		foil,
		size: STICKER_BASE_WIDTH,
		...extra
	});

	const groups: Group[] = [
		{
			id: 'shape',
			title: 'Photo shapes · no photo draws the outline only',
			samples: PHOTO_SHAPES.map((photo_shape) => ({
				id: photo_shape,
				label: photo_shape,
				view: v({}, { photo_shape })
			}))
		},
		{
			id: 'divider',
			title: 'Divider · one link row · H 112 / 140 / 196 / H_max 234 (bio hidden)',
			samples: [112, 140, 196, photoHeightMax(1)].map((photo_height) => ({
				id: String(photo_height),
				label: `H ${photo_height}`,
				view: v({ bio: LONG_BIO, links: EIGHT_LINKS.slice(0, 1) }, { photo_height })
			}))
		},
		{
			id: 'links',
			title: 'Links · 0 / 1 / 4 / 8 (5–8 under the default sticker)',
			samples: [0, 1, 4, 8].map((n) => ({
				id: String(n),
				label: `${n} links`,
				view: v({ links: EIGHT_LINKS.slice(0, n), bio: LONG_BIO }, { photo_height: 112 })
			}))
		},
		{
			id: 'align',
			title: 'Alignment · name, username row, bio',
			samples: ALIGNMENTS.map((alignment) => ({
				id: alignment,
				label: alignment,
				view: v({ pronouns: 'they/them', affiliation: null }, { alignment })
			}))
		},
		{
			id: 'fit',
			title: 'Fit · long name, 20-char username, long pronouns',
			samples: [
				{ id: 'name', label: 'name cut', view: v({ title: 'Alexandria Montgomery-Vale' }) },
				{
					id: 'centre',
					label: 'centre collision',
					view: v(
						{ handle: 'abcdefghijklmnopqrst', pronouns: 'she/they', affiliation: null },
						{ alignment: 'center' }
					)
				},
				{ id: 'pill', label: 'pill truncates', view: v({ pronouns: 'she/her/hers/they/them' }) }
			]
		},
		{
			id: 'edge',
			title: 'Edges',
			samples: FRAME_KEYS.map((frame) => ({ id: frame, label: frame, view: v({}, { frame }) }))
		},
		{
			id: 'face',
			title: 'Faces',
			samples: BG_SAMPLE.map((bg) => ({ id: bg, label: bg, view: v({}, { bg }) }))
		},
		{
			id: 'tier',
			title: 'Tiers · the foil covers the whole face',
			samples: CARD_TIERS.map((spec) => ({
				id: String(spec.tier),
				label: `T${spec.tier} · ${spec.label}`,
				view: DEMO_CARD,
				tier: spec.tier
			}))
		},
		{
			id: 'binder',
			title: 'Binder size · identical layout at ~0.42×',
			samples: CARD_TIERS.slice(0, 3).map((spec, i) => ({
				id: String(spec.tier),
				label: '',
				view: v(
					{ links: EIGHT_LINKS.slice(0, [2, 4, 8][i]), bio: LONG_BIO },
					{ photo_shape: PHOTO_SHAPES[i], bg: BG_SAMPLE[i + 2] }
				),
				width: BINDER,
				tier: spec.tier,
				detail: 'thumb' as const
			}))
		},
		{
			// the app's /dev/foil-lab: the demo on silver / blush, every foil
			id: 'lab',
			title: 'Foil lab · silver on blush, every kind (app: /dev/foil-lab)',
			samples: FOIL_KINDS.map((kind) => ({
				id: kind,
				label: kind,
				view: v({}, { frame: 'silver', bg: 'blush' }),
				width: LAB,
				foil: kind,
				detail: 'thumb' as const
			}))
		},
		{
			// the app's /dev/stickers cards
			id: 'stickers',
			title: 'Stickers · a glitter card and every rung (app: /dev/stickers)',
			samples: [
				{
					id: 'glitter-check',
					label: 'glitter sticker on a glitter card',
					width: LAB,
					foil: 'glitter',
					view: {
						...DEMO_CARD,
						affiliation: null,
						stickers: [
							place('sparkles', 0.3, 0.42, 'glitter', { scale: 1.3 }),
							place('heart', 0.72, 0.4, 'none', { scale: 1.1 })
						]
					}
				},
				{
					id: 'rungs',
					label: 'every rung, and a holo fandom sticker',
					width: LAB,
					foil: null,
					view: {
						...DEMO_CARD,
						affiliation: null,
						stickers: [
							place('star', 0.2, 0.2, 'none', { rotation: -8 }),
							place('star', 0.78, 0.2, 'glitter', { rotation: 6 }),
							place('star', 0.5, 0.45, 'holo', { scale: 1.2 }),
							place('star', 0.22, 0.72, 'cosmic', { rotation: 12 }),
							place('star', 0.78, 0.72, 'mosaic', { rotation: -10 }),
							place('fandom-scifi', 0.5, 0.92, 'holo', {
								kind: 'fandom',
								label: 'Sci-fi',
								style_category: 'retro-sci-fi',
								is_affiliation: false,
								size: 0.3
							})
						]
					}
				}
			]
		},
		{
			// what the app's galleries don't show
			id: 'more',
			title: 'More · 5 links, overflowing bio, the affiliation over a foiled card',
			samples: [
				{
					id: 'five',
					label: '5 links',
					view: v({ links: EIGHT_LINKS.slice(0, 5), bio: LONG_BIO }, { photo_height: 126 })
				},
				{
					id: 'overflow',
					label: 'bio overflows',
					view: v(
						{ bio: `${LONG_BIO} ${LONG_BIO}`, pronouns: 'xe/xem', links: EIGHT_LINKS.slice(0, 2) },
						{ photo_height: 112, bg: 'slate', frame: 'ink', photo_shape: 'circle' }
					)
				},
				{
					id: 'affiliation',
					label: 'affiliation + foiled stickers, mosaic',
					foil: 'mosaic',
					view: v({
						stickers: [
							place('dragon', 0.2, 0.3, 'cosmic', { rotation: 10 }),
							place('crown', 0.75, 0.25, 'holo', { scale: 0.8 })
						]
					})
				}
			]
		}
	];

	const backs = ['qr', 'placeholder', 'record'] as const;
	const foilFor = (s: Sample) =>
		s.foil === null ? undefined : (s.foil ?? foilForTier(s.tier ?? 0));
</script>

<svelte:head><title>Cards · dev</title></svelte:head>

<h1 class="display text-2xl">Card gallery</h1>
<p class="mt-1 text-xs text-faint">
	Dev only. The app's galleries on the web card: <code>?tilt=x,y</code>, <code>?t=0</code>,
	<code>?ref=rnweb</code>.
</p>

{#each groups as g (g.id)}
	<section class="group">
		<h2 class="meta text-holo">{g.title}</h2>
		<div class="row">
			{#each g.samples as s (s.id)}
				<figure>
					<div
						style="width: {s.width ?? HERO}px"
						data-card="{g.id}-{s.id}"
						data-width={s.width ?? HERO}
					>
						<Card view={s.view} {catalog} foil={foilFor(s)} detail={s.detail ?? 'full'} {rx} {ry} />
					</div>
					{#if s.label}<figcaption>{s.label}</figcaption>{/if}
				</figure>
			{/each}
		</div>
	</section>
	{#if g.id === 'tier'}
		<section class="group">
			<h2 class="meta text-holo">Back · qr / offline placeholder / record</h2>
			<div class="row">
				{#each backs as variant (variant)}
					<figure>
						<div style="width: {HERO}px" data-card="back-{variant}" data-width={HERO}>
							<CardBack
								style={DEMO_CARD.style}
								{variant}
								qrValue="https://concard.me/oskar"
								url="concard.me/oskar"
								record={{
									collected: 'Sep 23, 2026',
									event: 'In person',
									note: 'First meeting logged.'
								}}
								{rx}
								{ry}
							/>
						</div>
						<figcaption>{variant}</figcaption>
					</figure>
				{/each}
			</div>
		</section>
	{/if}
{/each}

<section class="group">
	<h2 class="meta text-holo">The ladder, loose</h2>
	{#each ['star', 'sparkles'] as id (id)}
		<div class="ladder">
			{#each STICKER_FOILS as f (f)}
				<StickerTile sticker={catalog.get(id)} foil={f} title="{id} · {f}" />
			{/each}
		</div>
	{/each}
</section>

<section class="group">
	<h2 class="meta text-holo">A bare shell · no foil stack at all</h2>
	<div style="width: {HERO}px">
		<CardShell style={DEMO_CARD.style}><span></span></CardShell>
	</div>
</section>

<style>
	.group {
		margin-top: 1.5rem;
		padding: 0.75rem;
		border-radius: 1rem;
		border: 1px solid var(--color-line);
		background: var(--color-raised);
	}
	.row {
		margin-top: 0.75rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	figure {
		margin: 0;
	}
	figcaption {
		margin-top: 0.25rem;
		font-size: 9px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-faint);
	}
	.ladder {
		margin-top: 0.5rem;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 0.25rem;
	}
</style>
