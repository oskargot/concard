<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head><title>{page.status} · concard</title></svelte:head>

<div class="mt-16 text-center">
	<p class="display text-6xl text-line">{page.status}</p>
	<h1 class="mt-2 text-xl font-bold">{page.error?.message ?? 'Something went wrong'}</h1>
	<a href="/" class="mt-6 btn-secondary">Go home</a>
</div>
