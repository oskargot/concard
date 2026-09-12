<script lang="ts">
	import type { CardView, PlacedSticker } from '$lib/types';
	import { stickerRotation } from '$lib/card-style';
	import type { StickerCatalog } from '$lib/card';
	import CardShell from './CardShell.svelte';
	import StickerGlyph from './StickerGlyph.svelte';

	interface Props {
		view: CardView;
		catalog: StickerCatalog;
		/** Pointer tilt, in degrees; drives the light. */
		rx?: number;
		ry?: number;
		dragging?: boolean;
		/** When set, stickers become pointer targets and the selected one is outlined. */
		editable?: boolean;
		selectedId?: string | null;
		/** The fandom badge is placed like a sticker, so it can be picked up too. */
		badgeSelected?: boolean;
		onstickerdown?: (sticker: PlacedSticker, event: PointerEvent) => void;
		onbadgedown?: (event: PointerEvent) => void;
		onfacedown?: (event: PointerEvent) => void;
	}

	let {
		view,
		catalog,
		rx = 0,
		ry = 0,
		dragging = false,
		editable = false,
		selectedId = null,
		badgeSelected = false,
		onstickerdown,
		onbadgedown,
		onfacedown
	}: Props = $props();

	const MAX_CHIPS = 3;
	const chips = $derived(view.links.slice(0, MAX_CHIPS));
	const more = $derived(Math.max(0, view.links.length - MAX_CHIPS));
	const stickers = $derived([...view.stickers].sort((a, b) => a.z_index - b.z_index));
	// While the badge is still sitting over the footer, the chips leave room for
	// it, the way the old flex row did. Moved anywhere else, they take the width.
	const badgeOverFooter = $derived(
		!!view.affiliation && view.affiliation.x > 0.62 && view.affiliation.y > 0.76
	);
</script>

<CardShell style={view.style} fx {rx} {ry} {dragging} {editable} {onfacedown}>
	<div class="body photo-{view.style.photo_shape}">
		<header class="head">
			<div class="name">{view.title}</div>
			<div class="handle">@{view.handle}</div>
		</header>

		<div class="photo">
			{#if view.art_url}
				<img src={view.art_url} alt="" draggable="false" />
			{:else}
				<span class="lab">photo</span>
			{/if}
		</div>

		<div class="bio">{view.bio}</div>

		<footer class="foot">
			<div class="links" class:reserve={badgeOverFooter}>
				{#each chips as l, i (l.url + i)}
					<span class="chip">{l.label || l.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
				{/each}
				{#if more > 0}<span class="lab more">+{more} more</span>{/if}
			</div>
		</footer>
	</div>

	{#snippet overlay()}
		{#if view.affiliation}
			{@const a = view.affiliation}
			<div
				class="badge-holder"
				class:selected={editable && badgeSelected}
				role={editable ? 'presentation' : undefined}
				style="left: {a.x * 100}%; top: {a.y * 100}%;"
				onpointerdown={editable && onbadgedown
					? (e) => {
							e.stopPropagation();
							onbadgedown(e);
						}
					: undefined}
			>
				<div
					class="badge"
					style="background: linear-gradient(150deg, {a.color_a}, {a.color_b})"
					title={a.name}
				>
					<span class="mark">{a.mark}</span>
					<span class="badge-name">{a.name}</span>
				</div>
			</div>
		{/if}
		{#each stickers as s (s.id ?? `${s.sticker_id}-${s.x}-${s.y}`)}
			<div
				class="sticker"
				class:selected={editable && s.id != null && s.id === selectedId}
				role={editable ? 'presentation' : undefined}
				style="left: {s.x * 100}%; top: {s.y * 100}%; z-index: {s.z_index + 1};
					transform: translate(-50%, -50%) rotate({s.rotation +
					stickerRotation(s.id ?? s.sticker_id)}deg) scale({s.scale});"
				onpointerdown={editable && onstickerdown
					? (e) => {
							e.stopPropagation();
							onstickerdown(s, e);
						}
					: undefined}
			>
				<div class="cut">
					<StickerGlyph sticker={catalog.get(s.sticker_id)} label={false} />
				</div>
			</div>
		{/each}
	{/snippet}
</CardShell>

<style>
	.body {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		gap: 3cqw;
		padding: 4.67cqw;
		color: var(--ink);
	}

	/* ruled header */
	.head {
		display: flex;
		flex-direction: column;
		gap: 1cqw;
		padding-bottom: 2cqw;
		border-bottom: var(--hair) solid var(--ink);
		min-width: 0;
	}
	.name {
		font:
			400 7.67cqw/1 Fredoka,
			system-ui,
			sans-serif;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.handle {
		font:
			700 max(3.17cqw, 7px) / 1.2 'Space Mono',
			ui-monospace,
			monospace;
		color: var(--mute);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* photo slot */
	.photo {
		flex: none;
		height: 47.33cqw;
		border-radius: 4.67cqw;
		overflow: hidden;
		display: grid;
		place-items: center;
		background: repeating-linear-gradient(135deg, var(--hatch-a) 0 7px, var(--hatch-b) 7px 14px);
	}
	.photo img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.photo-square .photo {
		border-radius: 1.33cqw;
	}
	.photo-arch .photo {
		border-radius: 31.33cqw 31.33cqw 4.67cqw 4.67cqw;
	}
	.photo-circle .photo {
		height: 49.33cqw;
		width: 49.33cqw;
		border-radius: 50%;
		align-self: center;
	}

	/* bio panel */
	.bio {
		flex: 1;
		min-height: 0;
		overflow: hidden;
		border-radius: 4.67cqw;
		padding: 2.67cqw 3cqw;
		background: var(--wash);
		border: var(--hair) solid color-mix(in srgb, var(--ink) 25%, transparent);
		font:
			400 max(3.83cqw, 8px) / 1.45 Archivo,
			system-ui,
			sans-serif;
		color: var(--body);
		overflow-wrap: anywhere;
	}

	/* footer */
	.foot {
		display: flex;
		align-items: flex-end;
		gap: 2cqw;
		margin-top: auto;
	}
	.links {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1.33cqw;
	}
	.links.reserve {
		padding-right: 22cqw;
	}
	.chip {
		max-width: 100%;
		border-radius: 3cqw;
		padding: 1.33cqw 2.67cqw;
		background: var(--wash);
		border: var(--hair) solid color-mix(in srgb, var(--ink) 25%, transparent);
		font:
			600 max(3.17cqw, 7px) / 1.2 Archivo,
			system-ui,
			sans-serif;
		color: var(--ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.lab {
		font:
			700 max(2.67cqw, 6.5px) / 1 'Space Mono',
			ui-monospace,
			monospace;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--mute);
	}
	.badge-holder {
		position: absolute;
		transform: translate(-50%, -50%);
		z-index: 0;
	}
	:global(.editable) .badge-holder {
		pointer-events: auto;
		cursor: grab;
	}
	.badge-holder.selected .badge {
		outline: 0.85cqw solid var(--ink, #17161b);
		outline-offset: 0.6cqw;
	}
	.badge {
		flex: none;
		width: 20cqw;
		height: 20cqw;
		border-radius: 4.67cqw;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1cqw;
		color: #fbf9f3;
		text-align: center;
		padding: 1cqw;
	}
	.mark {
		font:
			700 5cqw/1 'Space Mono',
			ui-monospace,
			monospace;
	}
	.badge-name {
		font:
			700 1.83cqw/1.1 'Space Mono',
			ui-monospace,
			monospace;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* miniatures (binder thumbnails): the pixel floors on chip and bio type would
	   overflow, so show name, photo and badge only */
	@container (max-width: 180px) {
		.bio,
		.links {
			display: none;
		}
		.photo {
			flex: 1;
			height: auto;
		}
		.photo-circle .photo {
			flex: none;
			height: 49.33cqw;
		}
	}

	@container (max-width: 110px) {
		.handle {
			display: none;
		}
	}

	/* die-cut stickers, outside the face clip: the image (or emoji glyph) with a
	   paper-white outline traced around its alpha, like a real vinyl sticker */
	.sticker {
		position: absolute;
		width: 15.33cqw;
		height: 15.33cqw;
		display: grid;
		place-items: center;
		transform-origin: center;
		--rim: #fbf9f3;
		--rim-w: 0.7cqw;
	}
	.cut {
		width: 100%;
		height: 100%;
		display: grid;
		place-items: center;
		font-size: 11cqw;
		line-height: 1;
		/* four hard shadows trace the paper rim around the alpha; a soft dark edge
		   keeps pale stickers legible on pale cards; the last one lifts it off the card */
		filter: drop-shadow(var(--rim-w) 0 0 var(--rim))
			drop-shadow(calc(-1 * var(--rim-w)) 0 0 var(--rim)) drop-shadow(0 var(--rim-w) 0 var(--rim))
			drop-shadow(0 calc(-1 * var(--rim-w)) 0 var(--rim))
			drop-shadow(0 0 0.25cqw rgb(23 22 27 / 0.45)) drop-shadow(0 1cqw 1.6cqw rgb(23 22 27 / 0.3));
	}
	.cut :global(img) {
		width: 86%;
		height: 86%;
		object-fit: contain;
	}
	:global(.editable) .sticker {
		pointer-events: auto;
		cursor: grab;
	}
	.sticker.selected {
		--rim: var(--ink, #17161b);
		--rim-w: 0.85cqw;
	}
</style>
