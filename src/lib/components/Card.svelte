<script lang="ts">
	import type { CardTemplate, CardView, PlacedSticker } from '$lib/types';
	import { resolveColors, templateConfig, type StickerCatalog } from '$lib/card';
	import StickerGlyph from './StickerGlyph.svelte';

	interface Props {
		view: CardView;
		template: CardTemplate | undefined;
		catalog: StickerCatalog;
		/** When set, stickers become pointer targets and the selected one is outlined. */
		editable?: boolean;
		selectedId?: string | null;
		onstickerdown?: (sticker: PlacedSticker, event: PointerEvent) => void;
		onfacedown?: (event: PointerEvent) => void;
	}

	let {
		view,
		template,
		catalog,
		editable = false,
		selectedId = null,
		onstickerdown,
		onfacedown
	}: Props = $props();

	const colors = $derived(resolveColors(view.colors, template));
	const cfg = $derived(templateConfig(template));
	const stickers = $derived([...view.stickers].sort((a, b) => a.z_index - b.z_index));
</script>

<!--
  The card is sized by its container: whatever width the parent gives it, the
  card keeps a 5:7 trading-card ratio and scales all text with cqw units, so the
  same component renders a hero card and a binder thumbnail.
-->
<div class="card-wrap" class:editable>
	<div
		class="card frame-{cfg.frame} font-{cfg.font}"
		style="--primary: {colors.primary}; --secondary: {colors.secondary}; --accent: {colors.accent};"
		role={editable ? 'presentation' : undefined}
		onpointerdown={editable ? onfacedown : undefined}
	>
		<div class="face">
			<div class="title-row">
				<h3 class="title">{view.title}</h3>
			</div>
			<div class="art">
				{#if view.art_url}
					<img src={view.art_url} alt="" draggable="false" />
				{:else}
					<div class="art-empty">
						<span>✦</span>
					</div>
				{/if}
			</div>
			<div class="text">
				{#if view.subtitle}<div class="subtitle">{view.subtitle}</div>{/if}
				{#if view.flavor_text}<p class="flavor">{view.flavor_text}</p>{/if}
			</div>
		</div>

		<div class="stickers" aria-hidden={editable ? undefined : true}>
			{#each stickers as s (s.id ?? `${s.sticker_id}-${s.x}-${s.y}`)}
				<div
					class="sticker"
					role={editable ? 'presentation' : undefined}
					class:selected={editable && s.id != null && s.id === selectedId}
					style="left: {s.x * 100}%; top: {s.y * 100}%; z-index: {s.z_index + 1};
						transform: translate(-50%, -50%) rotate({s.rotation}deg) scale({s.scale});"
					onpointerdown={editable && onstickerdown
						? (e) => {
								e.stopPropagation();
								onstickerdown(s, e);
							}
						: undefined}
				>
					<StickerGlyph sticker={catalog.get(s.sticker_id)} label={false} />
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.card-wrap {
		container-type: inline-size;
		width: 100%;
	}
	.card {
		position: relative;
		aspect-ratio: 5 / 7;
		width: 100%;
		border-radius: 5cqw;
		overflow: hidden;
		background: var(--secondary);
		color: var(--primary);
		box-shadow:
			0 1cqw 2cqw rgb(0 0 0 / 0.2),
			0 6cqw 14cqw rgb(0 0 0 / 0.25);
		user-select: none;
		-webkit-user-select: none;
		touch-action: none;
	}
	.editable .card {
		cursor: crosshair;
	}
	.face {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		padding: 5cqw;
		gap: 3cqw;
	}
	.title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 9cqw;
	}
	.title {
		margin: 0;
		font-size: 7cqw;
		font-weight: 800;
		line-height: 1.1;
		letter-spacing: -0.01em;
		overflow-wrap: anywhere;
	}
	.art {
		flex: 1 1 auto;
		min-height: 0;
		border-radius: 3cqw;
		overflow: hidden;
		background: color-mix(in srgb, var(--primary) 12%, var(--secondary));
		border: 1cqw solid color-mix(in srgb, var(--primary) 30%, transparent);
	}
	.art img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.art-empty {
		height: 100%;
		display: grid;
		place-items: center;
		font-size: 18cqw;
		color: color-mix(in srgb, var(--primary) 35%, transparent);
	}
	.text {
		min-height: 18cqw;
		display: flex;
		flex-direction: column;
		gap: 1.5cqw;
	}
	.subtitle {
		font-size: 4.2cqw;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--accent);
	}
	.flavor {
		margin: 0;
		font-size: 4cqw;
		line-height: 1.35;
		font-style: italic;
		opacity: 0.85;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
	}

	/* fonts */
	.font-serif {
		font-family: Georgia, 'Times New Roman', serif;
	}
	.font-sans {
		font-family:
			system-ui,
			-apple-system,
			'Segoe UI',
			Roboto,
			sans-serif;
	}
	.font-mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	}

	/* frames */
	.frame-solid {
		border: 3.5cqw solid var(--primary);
	}
	.frame-gradient {
		border: 3.5cqw solid transparent;
		background:
			linear-gradient(var(--secondary), var(--secondary)) padding-box,
			linear-gradient(135deg, var(--primary), var(--accent), var(--primary)) border-box;
	}
	.frame-pixel {
		border: 3.5cqw solid var(--primary);
		outline: 1.5cqw solid var(--accent);
		outline-offset: -5.5cqw;
		border-radius: 1.5cqw;
	}
	.frame-none .face {
		padding: 0;
		gap: 0;
	}
	.frame-none .title-row {
		position: absolute;
		z-index: 2;
		top: 0;
		left: 0;
		right: 0;
		padding: 5cqw;
		background: linear-gradient(rgb(0 0 0 / 0.55), transparent);
		color: #fff;
	}
	.frame-none .art {
		border: 0;
		border-radius: 0;
	}
	.frame-none .text {
		position: absolute;
		z-index: 2;
		bottom: 0;
		left: 0;
		right: 0;
		padding: 5cqw;
		background: linear-gradient(transparent, rgb(0 0 0 / 0.7));
		color: #fff;
	}

	/* stickers */
	.stickers {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.sticker {
		position: absolute;
		width: 14cqw;
		height: 14cqw;
		display: grid;
		place-items: center;
		font-size: 12cqw;
		filter: drop-shadow(0 0.6cqw 0.8cqw rgb(0 0 0 / 0.35));
		transform-origin: center;
	}
	.editable .sticker {
		pointer-events: auto;
		cursor: grab;
		border-radius: 50%;
	}
	.editable .sticker.selected {
		outline: 0.8cqw dashed var(--accent);
		outline-offset: 0.8cqw;
	}
</style>
