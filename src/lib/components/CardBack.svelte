<script lang="ts">
	import type { CardColors, CardTemplate, Sticker } from '$lib/types';
	import { resolveColors } from '$lib/card';
	import StickerGlyph from './StickerGlyph.svelte';

	interface Note {
		label: string;
		value: string;
	}

	interface Props {
		colors: CardColors;
		template: CardTemplate | undefined;
		/** Your own card shows your QR; a collected card shows notes instead. */
		variant: 'qr' | 'notes';
		qrSvg?: string;
		username?: string;
		notes?: Note[];
		bonusSticker?: Sticker | undefined;
	}

	let {
		colors,
		template,
		variant,
		qrSvg = '',
		username = '',
		notes = [],
		bonusSticker
	}: Props = $props();

	const c = $derived(resolveColors(colors, template));
</script>

<div class="back-wrap">
	<div
		class="back"
		style="--primary: {c.primary}; --secondary: {c.secondary}; --accent: {c.accent};"
	>
		<div class="pattern"></div>
		<div class="content">
			{#if variant === 'qr'}
				<div class="qr">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG generated server-side from a URL we control -->
					{@html qrSvg}
				</div>
				<div class="handle">@{username}</div>
				<div class="hint">scan to collect</div>
			{:else}
				<div class="brand">concard</div>
				<dl class="notes">
					{#each notes as n (n.label)}
						<div class="note">
							<dt>{n.label}</dt>
							<dd>{n.value}</dd>
						</div>
					{/each}
				</dl>
				{#if bonusSticker}
					<div class="bonus">
						<span class="bonus-glyph"><StickerGlyph sticker={bonusSticker} /></span>
						<span>+1 {bonusSticker.name}</span>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>

<style>
	.back-wrap {
		container-type: inline-size;
		width: 100%;
	}
	.back {
		position: relative;
		aspect-ratio: 5 / 7;
		width: 100%;
		border-radius: 5cqw;
		overflow: hidden;
		background: var(--primary);
		color: var(--secondary);
		border: 3.5cqw solid var(--primary);
		box-shadow:
			0 1cqw 2cqw rgb(0 0 0 / 0.2),
			0 6cqw 14cqw rgb(0 0 0 / 0.25);
		font-family:
			system-ui,
			-apple-system,
			'Segoe UI',
			Roboto,
			sans-serif;
	}
	.pattern {
		position: absolute;
		inset: 0;
		background-image: radial-gradient(
			color-mix(in srgb, var(--accent) 45%, transparent) 1.2cqw,
			transparent 1.3cqw
		);
		background-size: 8cqw 8cqw;
		opacity: 0.5;
		mask-image: linear-gradient(rgb(0 0 0 / 0.9), rgb(0 0 0 / 0.3));
	}
	.content {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3cqw;
		padding: 8cqw;
		text-align: center;
	}
	.qr {
		width: 62cqw;
		background: #fff;
		padding: 3cqw;
		border-radius: 3cqw;
	}
	.qr :global(svg) {
		display: block;
		width: 100%;
		height: auto;
	}
	.handle {
		font-size: 6cqw;
		font-weight: 800;
		letter-spacing: -0.01em;
	}
	.hint {
		font-size: 3.6cqw;
		text-transform: uppercase;
		letter-spacing: 0.2em;
		opacity: 0.75;
	}
	.brand {
		font-size: 5cqw;
		font-weight: 800;
		letter-spacing: 0.25em;
		text-transform: lowercase;
		color: var(--accent);
	}
	.notes {
		margin: 0;
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 3cqw;
	}
	.note dt {
		font-size: 3.2cqw;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		opacity: 0.7;
	}
	.note dd {
		margin: 0.5cqw 0 0;
		font-size: 4.6cqw;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.bonus {
		margin-top: 2cqw;
		display: inline-flex;
		align-items: center;
		gap: 2cqw;
		padding: 2cqw 4cqw;
		border-radius: 999cqw;
		background: color-mix(in srgb, var(--secondary) 15%, transparent);
		font-size: 4cqw;
		font-weight: 600;
	}
	.bonus-glyph {
		font-size: 6cqw;
		line-height: 1;
	}
</style>
