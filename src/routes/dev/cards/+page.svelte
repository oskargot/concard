<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import CardBack from '$lib/components/CardBack.svelte';
	import FlipCard from '$lib/components/FlipCard.svelte';
	import { BG_KEYS, FRAME_KEYS, PHOTO_SHAPES, SHAPES, type CardStyle } from '$lib/card-style';
	import type { CardView, Sticker } from '$lib/types';

	const stickers: Sticker[] = [
		{
			id: 'star',
			name: 'Star',
			glyph: '⭐',
			image_url: null,
			rarity: 'common',
			source: 'starter',
			price_cents: null,
			sort_order: 1,
			is_active: true
		},
		{
			id: 'cat',
			name: 'Cat',
			glyph: '🐱',
			image_url: null,
			rarity: 'uncommon',
			source: 'drop',
			price_cents: null,
			sort_order: 2,
			is_active: true
		},
		{
			id: 'dragon',
			name: 'Dragon',
			glyph: '🐉',
			image_url: null,
			rarity: 'rare',
			source: 'drop',
			price_cents: null,
			sort_order: 3,
			is_active: true
		},
		{
			id: 'rainbow',
			name: 'Rainbow',
			glyph: '🌈',
			image_url: null,
			rarity: 'legendary',
			source: 'drop',
			price_cents: null,
			sort_order: 4,
			is_active: true
		}
	];
	const catalog = new Map(stickers.map((s) => [s.id, s]));

	const base: Omit<CardView, 'style'> = {
		title: 'Oskar',
		handle: 'oskar',
		bio: 'Anime and sci-fi con regular. Making concard. Will trade stickers for good tea recommendations.',
		art_url: null,
		affiliation: {
			id: 'anime',
			name: 'Anime',
			mark: 'ANI',
			color_a: '#ff7eb6',
			color_b: '#7c4dff'
		},
		links: [
			{ label: 'Bluesky', url: 'https://bsky.app/oskar' },
			{ label: 'Itch', url: 'https://oskar.itch.io' },
			{ label: 'Site', url: 'https://oskar.dev' },
			{ label: 'Ko-fi', url: 'https://ko-fi.com/oskar' },
			{ label: 'Tumblr', url: 'https://oskar.tumblr.com' }
		],
		stickers: [
			{ id: 'a', sticker_id: 'star', x: 0.96, y: 0.06, rotation: 0, scale: 1, z_index: 1 },
			{ id: 'b', sticker_id: 'cat', x: 0.08, y: 0.62, rotation: -10, scale: 1.1, z_index: 2 },
			{ id: 'c', sticker_id: 'dragon', x: 0.9, y: 0.9, rotation: 15, scale: 0.9, z_index: 3 },
			{ id: 'd', sticker_id: 'rainbow', x: -0.04, y: 0.3, rotation: 0, scale: 1, z_index: 4 }
		]
	};

	const withArt = { ...base, art_url: 'https://picsum.photos/seed/concard/600/600' };

	const hero: CardStyle = { frame: 'gold', bg: 'mint', shape: 'rounded', photo_shape: 'arch' };
	const variants: CardStyle[] = [
		{ frame: 'silver', bg: 'paper', shape: 'rounded', photo_shape: 'round' },
		{ frame: 'holo', bg: 'sky', shape: 'shaved', photo_shape: 'circle' },
		{ frame: 'ink', bg: 'slate', shape: 'rect', photo_shape: 'square' },
		{ frame: 'gold', bg: 'blush', shape: 'shaved', photo_shape: 'arch' },
		{ frame: 'silver', bg: 'butter', shape: 'rect', photo_shape: 'round' },
		{ frame: 'holo', bg: 'slate', shape: 'rounded', photo_shape: 'circle' }
	];

	let flipped = $state(false);
</script>

<svelte:head><title>Card gallery · dev</title></svelte:head>

<h1 class="text-xl font-black">Card gallery</h1>
<p class="text-xs text-white/50">Dev only. Drag the hero to tilt, tap to flip.</p>

<section class="mx-auto mt-6 max-w-[320px]" data-shot="hero">
	<FlipCard bind:flipped>
		{#snippet front(t)}<Card
				view={{ ...withArt, style: hero }}
				{catalog}
				rx={t.rx}
				ry={t.ry}
				dragging={t.dragging}
			/>{/snippet}
		{#snippet back()}<CardBack
				variant="qr"
				style={hero}
				url="concard.me/oskar"
				qrSvg="<svg viewBox='0 0 21 21' xmlns='http://www.w3.org/2000/svg'><rect width='21' height='21' fill='#fff'/><path fill='#111' d='M0 0h7v7H0zM1 1v5h5V1zM2 2h3v3H2zM14 0h7v7h-7zM15 1v5h5V1zM16 2h3v3h-3zM0 14h7v7H0zM1 15v5h5v-5zM2 16h3v3H2zM9 0h1v1H9zM11 0h1v2h-1zM9 2h2v1H9zM12 3h1v1h-1zM9 4h1v2H9zM11 5h2v1h-2zM0 9h1v1H0zM2 9h2v1H2zM5 9h1v2H5zM7 8h1v1H7zM9 8h2v1H9zM12 8h1v2h-1zM14 9h1v1h-1zM16 8h2v1h-2zM19 9h2v1h-2zM1 11h1v2H1zM3 12h2v1H3zM7 11h1v1H7zM9 11h1v2H9zM11 11h2v1h-2zM14 11h1v2h-1zM16 12h1v1h-1zM18 11h1v1h-1zM20 12h1v1h-1zM9 14h2v1H9zM12 14h1v2h-1zM14 14h2v2h-2zM17 14h1v1h-1zM19 14h2v1h-2zM9 16h1v1H9zM11 17h1v1h-1zM13 17h2v1h-2zM16 16h1v2h-1zM18 16h1v1h-1zM20 17h1v2h-1zM9 19h1v2H9zM11 19h2v1h-2zM14 19h1v2h-1zM16 19h2v1h-2zM19 20h1v1h-1z'/></svg>"
			/>{/snippet}
	</FlipCard>
	<button class="mt-3 btn-secondary w-full" type="button" onclick={() => (flipped = !flipped)}
		>Flip</button
	>
</section>

<h2 class="mt-10 text-sm font-bold text-white/70">Variants</h2>
<ul class="mt-3 grid grid-cols-3 gap-5" data-shot="variants">
	{#each variants as style (JSON.stringify(style))}
		<li>
			<Card view={{ ...base, style }} {catalog} />
			<p class="mt-2 text-center text-[10px] text-white/50">
				{style.frame} · {style.bg} · {style.shape} · {style.photo_shape}
			</p>
		</li>
	{/each}
</ul>

<h2 class="mt-10 text-sm font-bold text-white/70">Backs</h2>
<ul class="mt-3 grid grid-cols-2 gap-5" data-shot="backs">
	<li>
		<CardBack
			variant="qr"
			style={variants[1]}
			url="concard.me/oskar"
			qrSvg="<svg viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'><rect width='4' height='4' fill='#fff'/><path fill='#111' d='M0 0h1v1H0zM2 0h1v1H2zM1 1h1v1H1zM3 1h1v1H3zM0 2h1v1H0zM2 2h1v1H2zM1 3h1v1H1zM3 3h1v1H3z'/></svg>"
		/>
	</li>
	<li>
		<CardBack
			variant="record"
			style={variants[3]}
			record={{
				collected: '12 Sep 2026, 01:14',
				event: 'No event',
				note: 'Traded with @alice. They have your card too.'
			}}
		/>
	</li>
</ul>

<h2 class="mt-10 text-sm font-bold text-white/70">Thumbnail size</h2>
<ul class="mt-3 grid grid-cols-6 gap-3" data-shot="thumbs">
	{#each variants as style (JSON.stringify(style))}
		<li><Card view={{ ...withArt, style }} {catalog} /></li>
	{/each}
</ul>

<p class="mt-10 text-xs text-white/40">
	All frames: {FRAME_KEYS.join(', ')}. Backgrounds: {BG_KEYS.join(', ')}. Shapes: {SHAPES.join(
		', '
	)}. Photo: {PHOTO_SHAPES.join(', ')}.
</p>
