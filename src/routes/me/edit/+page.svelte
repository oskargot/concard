<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ProfileLink } from '$lib/types';

	let { data, form } = $props();

	// svelte-ignore state_referenced_locally
	const existing = (data.profile.links as ProfileLink[] | null) ?? [];
	let links = $state<ProfileLink[]>(
		existing.length ? existing.map((l) => ({ ...l })) : [{ label: '', url: '' }]
	);
</script>

<svelte:head><title>Edit profile · concard</title></svelte:head>

<a href="/me" class="text-sm text-white/60 hover:text-white">← Your card</a>
<h1 class="mt-2 text-2xl font-black tracking-tight">Edit profile</h1>
<p class="text-sm text-white/60">@{data.profile.username} · usernames can't be changed</p>

<form
	method="POST"
	action="?/avatar"
	enctype="multipart/form-data"
	use:enhance
	class="mt-6 flex items-center gap-4 panel"
>
	{#if data.profile.avatar_url}
		<img src={data.profile.avatar_url} alt="" class="h-16 w-16 rounded-full object-cover" />
	{:else}
		<div class="grid h-16 w-16 place-items-center rounded-full bg-white/10 text-2xl">◉</div>
	{/if}
	<div class="flex-1">
		<label class="label" for="avatar">Avatar</label>
		<input id="avatar" class="block w-full text-sm" type="file" name="avatar" accept="image/*" />
	</div>
	<button class="btn-secondary">Upload</button>
</form>

<form method="POST" action="?/save" use:enhance class="mt-4 space-y-4">
	<div>
		<label class="label" for="display_name">Display name</label>
		<input
			id="display_name"
			class="field"
			name="display_name"
			maxlength="40"
			required
			value={data.profile.display_name}
		/>
	</div>
	<div>
		<label class="label" for="bio">Bio</label>
		<textarea id="bio" class="field" name="bio" rows="3" maxlength="200"
			>{data.profile.bio}</textarea
		>
	</div>

	<fieldset>
		<legend class="label">Links</legend>
		<p class="mb-2 text-xs text-white/50">Shown under your card when someone scans you. Up to 8.</p>
		<div class="space-y-2">
			{#each links as link, i (i)}
				<div class="flex gap-2">
					<input
						class="field !w-32"
						name="link_label"
						placeholder="Label"
						maxlength="30"
						bind:value={link.label}
					/>
					<input
						class="field flex-1"
						name="link_url"
						placeholder="https://…"
						inputmode="url"
						bind:value={link.url}
					/>
					<button
						type="button"
						class="btn-secondary !px-3"
						aria-label="Remove link"
						onclick={() => (links = links.filter((_, j) => j !== i))}>×</button
					>
				</div>
			{/each}
		</div>
		{#if links.length < 8}
			<button
				type="button"
				class="mt-2 btn-secondary"
				onclick={() => (links = [...links, { label: '', url: '' }])}
			>
				Add link
			</button>
		{/if}
	</fieldset>

	{#if form?.error}<p class="text-sm text-rose-300" role="alert">{form.error}</p>{/if}

	<button class="btn-primary w-full">Save</button>
</form>
