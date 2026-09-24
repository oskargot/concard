<script lang="ts">
	/**
	 * The card back (card spec §5) — concard-app's `CardBack.tsx`. The same
	 * frame as the front, in the card's own edge colour, over one graphite face
	 * every card shares. The QR tile and the `concard.me/username` line under it
	 * are one group, centred (`layoutBack`, synced from the app).
	 *
	 *  - `qr` — your own card: the real code, drawn from the module matrix so
	 *    the quiet zone is exactly 4 modules.
	 *  - `placeholder` — a neutral edge and a stand-in code that can't be scanned.
	 *  - `record` — a collected card: the collector's record and no code, so a
	 *    binder card can never be re-scanned remotely.
	 */
	import {
		GRAPHITE,
		inkFor,
		NEUTRAL_EDGE,
		normalizeStyle,
		QR_TILE,
		type CardStyle
	} from '$lib/card-style';
	import { layoutBack } from '$lib/app-card/layout/back';
	import { BACK, FRAME } from '$lib/app-card/layout/spec';
	import { placeholderQrPath, qrPath } from '$lib/card-qr';
	import CardShell from './CardShell.svelte';

	interface Record {
		collected: string;
		event: string;
		note: string;
	}

	interface Props {
		style: CardStyle;
		variant: 'qr' | 'placeholder' | 'record';
		/** What the QR encodes: the stable profile url. */
		qrValue?: string;
		/** Human-readable link under the QR, e.g. concard.me/oskar */
		url?: string;
		record?: Record;
		rx?: number;
		ry?: number;
	}

	let { style, variant, qrValue = '', url = '', record, rx = 0, ry = 0 }: Props = $props();

	/** The graphite face's text roles: the slate face's tuned dark ink set. */
	const INK = inkFor('slate');
	const back = layoutBack();
	const u = (n: number) => `calc(var(--u) * ${n})`;
	const at = (x: number, y: number) => `left: ${u(x - FRAME.edge)}; top: ${u(y - FRAME.edge)};`;
	const qr = $derived(variant === 'qr' && qrValue ? qrPath(qrValue) : placeholderQrPath());
</script>

<CardShell
	style={normalizeStyle(style)}
	faceColor={GRAPHITE}
	edge={variant === 'placeholder' ? NEUTRAL_EDGE : undefined}
	{rx}
	{ry}
>
	{#if variant === 'record' && record}
		<div
			class="rec"
			style="padding: {u(FRAME.pad)}; gap: {u(12)}; --label: {u(8)}; --label-lh: {u(
				11
			)}; --track: {u(0.9)}; --mute: {INK.mute}; --ink: {INK.ink}; --line: {INK.line};"
		>
			<span class="rec-label">collector's record</span>
			<dl style="gap: {u(12)}">
				<div>
					<dt class="rec-label">collected</dt>
					<dd style="margin-top: {u(2)}; font-size: {u(14)}; line-height: {u(17)};">
						{record.collected}
					</dd>
				</div>
				<div>
					<dt class="rec-label">event</dt>
					<dd style="margin-top: {u(2)}; font-size: {u(14)}; line-height: {u(17)};">
						{record.event}
					</dd>
				</div>
				<div class="note" style="border-left-width: {u(2)}; padding-left: {u(7)};">
					<dt class="rec-label">note</dt>
					<dd style="margin-top: {u(2)}; font-size: {u(14)}; line-height: {u(17)};">
						{record.note}
					</dd>
				</div>
			</dl>
			<span class="rec-label foot" style="padding-top: {u(8)}; border-top-width: {u(1)};"
				>a collected card carries no code</span
			>
		</div>
	{:else}
		<div
			class="tile"
			style="{at(back.tile.x, back.tile.y)} width: {u(back.tile.w)}; height: {u(
				back.tile.h
			)}; border-radius: {u(BACK.tileRadius)}; background: {QR_TILE}; padding: {u(
				back.qr.x - back.tile.x
			)};"
		>
			<svg
				width="100%"
				height="100%"
				viewBox="0 0 {qr.total} {qr.total}"
				role="img"
				aria-label={variant === 'qr' ? `QR code for ${url}` : 'QR code not known yet'}
			>
				{#if variant === 'qr' && qrValue}
					<rect x="0" y="0" width={qr.total} height={qr.total} fill={QR_TILE} />
					<path d={qr.path} fill={GRAPHITE} />
				{:else}
					<path d={qr.path} fill={GRAPHITE} fill-rule="evenodd" opacity="0.28" />
				{/if}
			</svg>
		</div>
		{#if url}
			<div
				class="url"
				style="{at(back.url.x + FRAME.edge, back.url.y)} width: {u(
					back.url.w - FRAME.edge * 2
				)}; height: {u(back.url.h)}; font-size: {u(BACK.urlSize)}; line-height: {u(
					BACK.urlLineHeight
				)}; color: {INK.mute};"
			>
				{url}
			</div>
		{/if}
	{/if}
</CardShell>

<style>
	.tile,
	.url {
		position: absolute;
		box-sizing: border-box;
	}
	.tile svg {
		display: block;
	}
	.url {
		font-family: Outfit-Regular;
		text-align: center;
		white-space: nowrap;
		overflow: hidden;
	}
	.rec {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
	}
	.rec-label {
		display: block;
		font-family: Outfit-SemiBold;
		font-size: var(--label);
		line-height: var(--label-lh);
		letter-spacing: var(--track);
		text-transform: uppercase;
		color: var(--mute);
	}
	dl {
		margin: 0;
		flex: 1;
		display: flex;
		flex-direction: column;
	}
	dd {
		margin: 0;
		font-family: Outfit-Bold;
		color: var(--ink);
		overflow-wrap: anywhere;
	}
	.note {
		border-left-style: solid;
		border-left-color: var(--line);
	}
	.foot {
		border-top-style: solid;
		border-top-color: var(--line);
	}
</style>
