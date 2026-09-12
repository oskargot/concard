<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	let mode = $state<'signin' | 'signup'>('signin');
	let busy = $state(false);

	$effect(() => {
		if (form?.mode === 'signin' || form?.mode === 'signup') mode = form.mode;
	});
</script>

<svelte:head><title>Sign in · concard</title></svelte:head>

<div class="mx-auto mt-8 max-w-sm">
	<a href="/" class="text-sm text-dim hover:text-cream">← concard</a>
	<h1 class="mt-4 display text-3xl">
		{mode === 'signin' ? 'Welcome back' : 'Make your card'}
	</h1>
	<p class="mt-1 text-dim">
		{mode === 'signin'
			? 'Sign in to collect cards and show yours.'
			: 'One account, one QR code, as many cards as you like.'}
	</p>

	{#if form?.checkEmail}
		<div class="mt-6 panel border-sage/30 bg-sage/10">
			<p class="font-semibold">Check your email</p>
			<p class="mt-1 text-sm text-dim">
				We sent a confirmation link to <b>{form.email}</b>. Open it on this device to finish signing
				up.
			</p>
		</div>
	{:else}
		<div class="mt-6 flex gap-1 rounded-xl bg-surface p-1 text-sm font-semibold">
			<button
				type="button"
				class="flex-1 rounded-lg py-2 {mode === 'signin' ? 'bg-raised' : 'text-dim'}"
				onclick={() => (mode = 'signin')}>Sign in</button
			>
			<button
				type="button"
				class="flex-1 rounded-lg py-2 {mode === 'signup' ? 'bg-raised' : 'text-dim'}"
				onclick={() => (mode = 'signup')}>Create account</button
			>
		</div>

		<form
			method="POST"
			action="?/{mode}"
			class="mt-4 space-y-4"
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
				<label class="label" for="email">Email</label>
				<input
					id="email"
					class="field"
					type="email"
					name="email"
					autocomplete="email"
					required
					value={form?.email ?? ''}
				/>
			</div>
			<div>
				<label class="label" for="password">Password</label>
				<input
					id="password"
					class="field"
					type="password"
					name="password"
					autocomplete={mode === 'signin' ? 'current-password' : 'new-password'}
					minlength={mode === 'signup' ? 8 : undefined}
					required
				/>
			</div>

			{#if form?.error}
				<p class="text-sm text-ember" role="alert">{form.error}</p>
			{:else if data.authError}
				<p class="text-sm text-ember" role="alert">That sign-in link didn't work. Try again.</p>
			{/if}

			<button class="btn-primary w-full" disabled={busy}>
				{busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
			</button>
		</form>
	{/if}
</div>
