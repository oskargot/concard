<script lang="ts">
	import { page } from '$app/state';

	let { signedIn }: { signedIn: boolean } = $props();

	// Drawn rather than borrowed from a Unicode block, so they sit on the
	// baseline together and read at 20px on a phone.
	const ICONS = {
		home: ['M3 10.6 12 3.2l9 7.4', 'M5.6 9.4V20.3h12.8V9.4'],
		scan: [
			'M4 8.4V5.9A1.9 1.9 0 0 1 5.9 4h2.5',
			'M15.6 4h2.5A1.9 1.9 0 0 1 20 5.9v2.5',
			'M20 15.6v2.5a1.9 1.9 0 0 1-1.9 1.9h-2.5',
			'M8.4 20H5.9A1.9 1.9 0 0 1 4 18.1v-2.5',
			'M4 12h16'
		],
		binder: [
			'M4.4 4.6h6v6.2h-6z',
			'M13.6 4.6h6v6.2h-6z',
			'M4.4 13.2h6v6.2h-6z',
			'M13.6 13.2h6v6.2h-6z'
		],
		me: [
			'M5.6 3.4h12.8v17.2H5.6z',
			'M12 11.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8Z',
			'M8 17.4c.9-2 6.1-2 8 0'
		],
		signin: ['M10.5 4.5H18v15h-7.5', 'M13 12H4', 'M7.4 8.6 4 12l3.4 3.4']
	} as const;

	const tabs = $derived(
		signedIn
			? [
					{ href: '/', label: 'Home', icon: 'home' as const },
					{ href: '/scan', label: 'Scan', icon: 'scan' as const },
					{ href: '/binder', label: 'Binder', icon: 'binder' as const },
					{ href: '/me', label: 'Me', icon: 'me' as const }
				]
			: [
					{ href: '/', label: 'Home', icon: 'home' as const },
					{ href: '/login', label: 'Sign in', icon: 'signin' as const }
				]
	);

	function active(href: string): boolean {
		const p = page.url.pathname;
		return href === '/' ? p === '/' : p === href || p.startsWith(href + '/');
	}
</script>

<nav
	class="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ground/95 backdrop-blur"
	style="padding-bottom: env(safe-area-inset-bottom)"
	aria-label="Main"
>
	<ul class="mx-auto flex max-w-lg justify-around">
		{#each tabs as t (t.href)}
			{@const on = active(t.href)}
			<li class="flex-1">
				<a
					href={t.href}
					class="flex flex-col items-center gap-1 py-2.5 transition-colors {on
						? 'text-holo'
						: 'text-faint hover:text-paper'}"
					aria-current={on ? 'page' : undefined}
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.6"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-5 w-5"
						aria-hidden="true"
					>
						{#each ICONS[t.icon] as d (d)}<path {d} />{/each}
					</svg>
					<span class="meta text-[10px]">{t.label}</span>
				</a>
			</li>
		{/each}
	</ul>
</nav>
