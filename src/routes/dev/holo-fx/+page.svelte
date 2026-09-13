<script lang="ts">
	import StickerTile from '$lib/components/StickerTile.svelte';
	import {
		HOLO_VARIANTS,
		HOLO_VARIANT_LABEL,
		requestMotionPermission
	} from '$lib/components/HoloFoilFx.svelte';
	import { DEMO_STICKERS } from '$lib/demo-card';
	import type { StickerFoil } from '$lib/types';

	const FOILS: StickerFoil[] = ['none', 'glitter', 'holo'];

	let enabled = $state(true);
	let variant = $state<(typeof HOLO_VARIANTS)[number]>('linear');

	const needsMotionPermission = $derived(
		typeof DeviceOrientationEvent !== 'undefined' &&
			typeof (DeviceOrientationEvent as unknown as { requestPermission?: unknown })
				.requestPermission === 'function'
	);
	let motionStatus = $state<'idle' | 'granted' | 'denied' | 'unsupported'>('idle');

	async function enableMotion() {
		motionStatus = await requestMotionPermission();
	}
</script>

<svelte:head><title>Holo FX test · concard</title></svelte:head>

<h1 class="display text-2xl">Holo FX test</h1>
<p class="text-sm text-dim">
	Isolated test bed for the experimental prismatic foil effect. Move the mouse over a tile on
	desktop, or tilt the device on mobile. This does not touch the real sticker screens — every tile
	below is fixture data.
</p>

<div class="mt-5 flex flex-col gap-4 panel">
	<label class="flex items-center gap-2 text-sm font-semibold">
		<input type="checkbox" bind:checked={enabled} />
		Enable holographic foil effect
	</label>

	<fieldset class="flex flex-col gap-2">
		<legend class="text-xs font-semibold text-dim uppercase">Variant</legend>
		<div class="flex flex-wrap gap-3">
			{#each HOLO_VARIANTS as v (v)}
				<label class="flex items-center gap-1.5 text-sm">
					<input type="radio" name="variant" value={v} bind:group={variant} disabled={!enabled} />
					{HOLO_VARIANT_LABEL[v]}
				</label>
			{/each}
		</div>
	</fieldset>

	{#if needsMotionPermission}
		<div class="flex items-center gap-3">
			<button class="btn-secondary" onclick={enableMotion}>Enable motion tilt</button>
			{#if motionStatus === 'granted'}
				<span class="text-xs text-dim">Motion enabled — tilt your device.</span>
			{:else if motionStatus === 'denied'}
				<span class="text-xs text-ember">Permission denied.</span>
			{:else if motionStatus === 'unsupported'}
				<span class="text-xs text-dim">Motion not supported on this device.</span>
			{/if}
		</div>
	{/if}
</div>

{#each FOILS as foil (foil)}
	<h2 class="mt-6 text-sm font-semibold text-dim uppercase">{foil}</h2>
	<ul class="mt-2 grid grid-cols-4 gap-3 sm:grid-cols-6">
		{#each DEMO_STICKERS as sticker (sticker.id)}
			<li>
				<StickerTile {sticker} {foil} holoFx={enabled} holoVariant={variant} title={sticker.name} />
			</li>
		{/each}
	</ul>
{/each}
