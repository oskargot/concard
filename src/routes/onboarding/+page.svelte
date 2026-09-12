<script lang="ts">
	import { enhance } from '$app/forms';
	import { isValidUsername, normalizeUsername } from '$lib/username';

	let { data, form } = $props();

	// svelte-ignore state_referenced_locally
	let username = $state(form?.username ?? '');
	// svelte-ignore state_referenced_locally
	let displayName = $state(form?.displayName ?? '');
	let availability = $state<'idle' | 'checking' | 'free' | 'taken' | 'invalid'>('idle');
	let busy = $state(false);

	const normalized = $derived(normalizeUsername(username));

	// Live availability check, debounced, against the database function so the
	// answer matches what the server will say on submit.
	$effect(() => {
		const candidate = normalized;
		if (!candidate) {
			availability = 'idle';
			return;
		}
		if (!isValidUsername(candidate)) {
			availability = 'invalid';
			return;
		}
		availability = 'checking';
		const t = setTimeout(async () => {
			const { data: free } = await data.supabase.rpc('is_username_available', { candidate });
			if (normalizeUsername(username) === candidate) availability = free ? 'free' : 'taken';
		}, 350);
		return () => clearTimeout(t);
	});
</script>

<svelte:head><title>Pick a username · concard</title></svelte:head>

<div class="mx-auto mt-8 max-w-sm">
	<h1 class="display text-3xl">Pick your username</h1>
	<p class="mt-1 text-dim">
		It becomes your link and your QR code. You can't change it later, so choose one you like.
	</p>

	<form
		method="POST"
		class="mt-6 space-y-4"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update();
				busy = false;
			};
		}}
	>
		<input type="hidden" name="next" value={data.next} />
		<div>
			<label class="label" for="username">Username</label>
			<div class="flex items-center gap-2">
				<span class="text-faint">concard.me/</span>
				<input
					id="username"
					class="field"
					name="username"
					autocomplete="off"
					autocapitalize="off"
					spellcheck="false"
					required
					bind:value={username}
				/>
			</div>
			<p class="mt-1 h-5 text-xs" aria-live="polite">
				{#if availability === 'checking'}<span class="text-faint">Checking…</span>
				{:else if availability === 'free'}<span class="text-sage">@{normalized} is free</span>
				{:else if availability === 'taken'}<span class="text-ember">@{normalized} is taken</span>
				{:else if availability === 'invalid'}<span class="text-faint"
						>3 to 20 characters: a-z, 0-9, underscore</span
					>
				{/if}
			</p>
		</div>
		<div>
			<label class="label" for="display_name">Display name</label>
			<input
				id="display_name"
				class="field"
				name="display_name"
				maxlength="40"
				placeholder={normalized || 'What people call you'}
				bind:value={displayName}
			/>
		</div>

		{#if form?.error}
			<p class="text-sm text-ember" role="alert">{form.error}</p>
		{/if}

		<button
			class="btn-primary w-full"
			disabled={busy || availability === 'taken' || availability === 'invalid'}
		>
			{busy ? 'Saving…' : 'Claim it'}
		</button>
	</form>
</div>
