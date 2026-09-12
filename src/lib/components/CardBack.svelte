<script lang="ts">
	import type { CardStyle } from '$lib/card-style';
	import CardShell from './CardShell.svelte';

	interface Record {
		collected: string;
		event: string;
		note: string;
	}

	interface Props {
		style: CardStyle;
		/** Your own card shows your QR; a collected card shows the collector's record. */
		variant: 'qr' | 'record';
		qrSvg?: string;
		/** Human-readable link shown under the QR, e.g. concard.me/oskar */
		url?: string;
		record?: Record;
	}

	let { style, variant, qrSvg = '', url = '', record }: Props = $props();
</script>

<!-- The back is always ink, whatever the front's background: the reverse of a printed card. -->
<CardShell {style} faceColor="#17161b">
	<div class="back">
		{#if variant === 'qr'}
			<div class="centre">
				<span class="lab">scan me</span>
				<div class="plate">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG generated server-side from a URL we control -->
					{@html qrSvg}
				</div>
				<span class="lab url">{url}</span>
			</div>
		{:else if record}
			<div class="rec">
				<span class="lab">collector's record</span>
				<dl>
					<div class="row">
						<dt class="lab">collected</dt>
						<dd>{record.collected}</dd>
					</div>
					<div class="row">
						<dt class="lab">event</dt>
						<dd>{record.event}</dd>
					</div>
					<div class="row note">
						<dt class="lab">note</dt>
						<dd>{record.note}</dd>
					</div>
				</dl>
				<div class="foot lab">a collected card carries no code</div>
			</div>
		{/if}
	</div>
</CardShell>

<style>
	.back {
		position: absolute;
		inset: 0;
		padding: 6cqw 5.33cqw;
		color: #f2efe6;
		--mute: #a9a4b8;
		--hair: max(0.5cqw, 1px);
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
	.centre {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4cqw;
		text-align: center;
	}
	.plate {
		width: 60cqw;
		padding: 3.33cqw;
		border-radius: 3.33cqw;
		background: #fbf9f3;
	}
	.plate :global(svg) {
		display: block;
		width: 100%;
		height: auto;
	}
	.url {
		overflow-wrap: anywhere;
	}
	.rec {
		height: 100%;
		display: flex;
		flex-direction: column;
		gap: 4.33cqw;
	}
	dl {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4.33cqw;
		flex: 1;
	}
	.row dd {
		margin: 1cqw 0 0;
		font:
			400 5.33cqw/1.15 Fredoka,
			system-ui,
			sans-serif;
		overflow-wrap: anywhere;
	}
	.note {
		border-left: calc(var(--hair) * 2) solid #e7f8f1;
		padding-left: 2.67cqw;
	}
	.foot {
		padding-top: 3cqw;
		border-top: var(--hair) solid rgb(242 239 230 / 0.25);
	}
</style>
