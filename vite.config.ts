import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-netlify';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig({
	// The foil engine's CanvasKit is imported lazily; pre-bundle it up front so
	// the dev server doesn't discover it mid-page and force a reload.
	optimizeDeps: { include: ['canvaskit-wasm/bin/full/canvaskit.js'] },
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Hosted on Netlify: server-rendered pages run as a Netlify function.
			adapter: adapter()
		}),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			manifest: {
				name: 'concard',
				short_name: 'concard',
				description: 'Trading cards for cons and events. Show your QR, collect everyone you meet.',
				start_url: '/me',
				scope: '/',
				display: 'standalone',
				orientation: 'portrait',
				background_color: '#121116',
				theme_color: '#121116',
				icons: [
					{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
					{
						src: '/icons/maskable-512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			},
			workbox: {
				// Cache the app shell; pages are rendered server-side and fetched live.
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}'],
				navigateFallback: null
			},
			devOptions: { enabled: false }
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
