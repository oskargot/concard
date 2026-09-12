<script lang="ts">
	import { enhance } from '$app/forms';
	import StickerGlyph from '$lib/components/StickerGlyph.svelte';
	import { RARITY_LABEL } from '$lib/card';

	let { data, form } = $props();

	const SOURCE_LABEL = {
		starter: 'Starter',
		drop: 'Drop',
		shop: 'Shop',
		event: 'Event'
	} as const;

	let creating = $state(false);
</script>

<svelte:head><title>Sticker catalog · admin</title></svelte:head>

<h1 class="display text-2xl">Sticker catalog</h1>
<p class="mt-1 text-xs text-faint">
	Upload a PNG or WebP with a transparent background — the die-cut rim and shadow trace the alpha
	automatically, no outline needed.
</p>

{#if form?.error}
	<p class="mt-3 text-sm text-ember" role="alert">{form.error}</p>
{/if}

<section class="mt-5 panel">
	<button
		type="button"
		class="text-sm font-semibold text-paper"
		onclick={() => (creating = !creating)}
	>
		{creating ? '− Cancel' : '+ Add a sticker'}
	</button>

	{#if creating}
		<form
			method="POST"
			action="?/create"
			enctype="multipart/form-data"
			use:enhance={() => {
				return async ({ result, update }) => {
					if (result.type === 'success') creating = false;
					await update();
				};
			}}
			class="mt-4 space-y-3"
		>
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="label" for="new-id">Id (slug)</label>
					<input
						id="new-id"
						class="field"
						name="id"
						placeholder="confetti-heart"
						pattern={'[a-z0-9][a-z0-9-]{1,29}'}
						required
					/>
				</div>
				<div>
					<label class="label" for="new-name">Name</label>
					<input id="new-name" class="field" name="name" maxlength="40" required />
				</div>
			</div>
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="label" for="new-rarity">Rarity</label>
					<select id="new-rarity" class="field" name="rarity">
						{#each Object.entries(RARITY_LABEL) as [value, label] (value)}
							<option {value}>{label}</option>
						{/each}
					</select>
				</div>
				<div>
					<label class="label" for="new-source">Source</label>
					<select id="new-source" class="field" name="source">
						{#each Object.entries(SOURCE_LABEL) as [value, label] (value)}
							<option {value}>{label}</option>
						{/each}
					</select>
				</div>
			</div>
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="label" for="new-sort">Sort order</label>
					<input id="new-sort" class="field" name="sort_order" type="number" value="0" />
				</div>
				<div>
					<label class="label" for="new-price">Price, cents (optional)</label>
					<input id="new-price" class="field" name="price_cents" type="number" min="0" />
				</div>
			</div>
			<div>
				<label class="label" for="new-glyph">Fallback emoji (optional if uploading art)</label>
				<input id="new-glyph" class="field" name="glyph" maxlength="8" placeholder="🎉" />
			</div>
			<div>
				<label class="label" for="new-image">Art (PNG/WebP, transparent background)</label>
				<input
					id="new-image"
					class="block w-full text-sm text-dim"
					type="file"
					name="image"
					accept="image/png,image/webp"
				/>
			</div>
			<button class="btn-primary">Add sticker</button>
		</form>
	{/if}
</section>

<ul class="mt-4 space-y-3">
	{#each data.stickers as sticker (sticker.id)}
		<li class="panel">
			<form
				method="POST"
				action="?/update"
				enctype="multipart/form-data"
				use:enhance
				class="flex flex-col gap-3 sm:flex-row sm:items-start"
			>
				<input type="hidden" name="id" value={sticker.id} />
				<div
					class="flex h-16 w-16 flex-none items-center justify-center rounded-lg border border-line bg-ground text-3xl"
				>
					<StickerGlyph {sticker} label={false} />
				</div>
				<div class="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3">
					<div class="col-span-2 sm:col-span-1">
						<label class="label" for="name-{sticker.id}">Name</label>
						<input
							id="name-{sticker.id}"
							class="field"
							name="name"
							maxlength="40"
							value={sticker.name}
							required
						/>
					</div>
					<div>
						<label class="label" for="rarity-{sticker.id}">Rarity</label>
						<select id="rarity-{sticker.id}" class="field" name="rarity" value={sticker.rarity}>
							{#each Object.entries(RARITY_LABEL) as [value, label] (value)}
								<option {value}>{label}</option>
							{/each}
						</select>
					</div>
					<div>
						<label class="label" for="source-{sticker.id}">Source</label>
						<select id="source-{sticker.id}" class="field" name="source" value={sticker.source}>
							{#each Object.entries(SOURCE_LABEL) as [value, label] (value)}
								<option {value}>{label}</option>
							{/each}
						</select>
					</div>
					<div>
						<label class="label" for="sort-{sticker.id}">Sort order</label>
						<input
							id="sort-{sticker.id}"
							class="field"
							name="sort_order"
							type="number"
							value={sticker.sort_order}
						/>
					</div>
					<div>
						<label class="label" for="price-{sticker.id}">Price, cents</label>
						<input
							id="price-{sticker.id}"
							class="field"
							name="price_cents"
							type="number"
							min="0"
							value={sticker.price_cents ?? ''}
						/>
					</div>
					<div>
						<label class="label" for="glyph-{sticker.id}">Fallback emoji</label>
						<input
							id="glyph-{sticker.id}"
							class="field"
							name="glyph"
							maxlength="8"
							value={sticker.glyph ?? ''}
						/>
					</div>
					<div class="col-span-2 sm:col-span-3">
						<label class="label" for="image-{sticker.id}">Replace art (PNG/WebP)</label>
						<input
							id="image-{sticker.id}"
							class="block w-full text-sm text-dim"
							type="file"
							name="image"
							accept="image/png,image/webp"
						/>
					</div>
					<label class="col-span-2 flex items-center gap-2 text-sm text-dim sm:col-span-3">
						<input type="checkbox" name="is_active" checked={sticker.is_active} />
						Active (shows up in drops and can be collected)
					</label>
				</div>
				<button class="btn-secondary self-start">Save</button>
			</form>
		</li>
	{/each}
</ul>

{#if data.stickers.length === 0}
	<p class="mt-4 text-sm text-faint">No stickers yet.</p>
{/if}
