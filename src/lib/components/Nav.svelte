<script lang="ts">
	import { page } from '$app/state';

	let { signedIn }: { signedIn: boolean } = $props();

	const tabs = $derived(
		signedIn
			? [
					{ href: '/', label: 'Home', icon: '⌂' },
					{ href: '/scan', label: 'Scan', icon: '▣' },
					{ href: '/binder', label: 'Binder', icon: '▤' },
					{ href: '/me', label: 'Me', icon: '◉' }
				]
			: [
					{ href: '/', label: 'Home', icon: '⌂' },
					{ href: '/login', label: 'Sign in', icon: '→' }
				]
	);

	function active(href: string): boolean {
		const p = page.url.pathname;
		return href === '/' ? p === '/' : p === href || p.startsWith(href + '/');
	}
</script>

<nav
	class="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-950/80 backdrop-blur"
	style="padding-bottom: env(safe-area-inset-bottom)"
	aria-label="Main"
>
	<ul class="mx-auto flex max-w-lg justify-around">
		{#each tabs as t (t.href)}
			<li class="flex-1">
				<a
					href={t.href}
					class="flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold tracking-wide uppercase
						{active(t.href) ? 'text-amber-300' : 'text-white/60 hover:text-white'}"
					aria-current={active(t.href) ? 'page' : undefined}
				>
					<span class="text-lg leading-none" aria-hidden="true">{t.icon}</span>
					{t.label}
				</a>
			</li>
		{/each}
	</ul>
</nav>
