<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { env } from '$env/dynamic/public';
	import jsQR from 'jsqr';
	import { usernameFromScan } from '$lib/username';

	let video: HTMLVideoElement | undefined = $state();
	let status = $state<'starting' | 'scanning' | 'denied' | 'unsupported' | 'found'>('starting');
	let manual = $state('');
	let bad = $state('');

	function allowedHosts(): string[] {
		const hosts = [location.hostname, 'concard.me', 'www.concard.me'];
		try {
			if (env.PUBLIC_SITE_URL) hosts.push(new URL(env.PUBLIC_SITE_URL).hostname);
		} catch {
			/* ignore malformed override */
		}
		return hosts;
	}

	function handle(payload: string): boolean {
		const username = usernameFromScan(payload, allowedHosts());
		if (!username) {
			bad = "That's not a concard code.";
			return false;
		}
		status = 'found';
		goto(`/${username}`);
		return true;
	}

	onMount(() => {
		if (!navigator.mediaDevices?.getUserMedia) {
			status = 'unsupported';
			return;
		}
		let stream: MediaStream | null = null;
		let raf = 0;
		let stopped = false;
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
		let lastTick = 0;

		const tick = (t: number) => {
			if (stopped) return;
			raf = requestAnimationFrame(tick);
			// ~10 decodes per second is plenty and keeps phones cool.
			if (t - lastTick < 100 || !video || video.readyState < 2) return;
			lastTick = t;
			const scale = Math.min(1, 480 / video.videoWidth);
			canvas.width = Math.floor(video.videoWidth * scale);
			canvas.height = Math.floor(video.videoHeight * scale);
			ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
			const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
			const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
			if (code?.data && handle(code.data)) stopped = true;
		};

		navigator.mediaDevices
			.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
			.then((s) => {
				if (stopped) {
					s.getTracks().forEach((tr) => tr.stop());
					return;
				}
				stream = s;
				if (video) {
					video.srcObject = s;
					video.play().catch(() => {});
				}
				status = 'scanning';
				raf = requestAnimationFrame(tick);
			})
			.catch(() => (status = 'denied'));

		return () => {
			stopped = true;
			cancelAnimationFrame(raf);
			stream?.getTracks().forEach((tr) => tr.stop());
		};
	});
</script>

<svelte:head><title>Scan · concard</title></svelte:head>

<h1 class="text-2xl font-black tracking-tight">Scan a card</h1>
<p class="text-sm text-white/60">Point your camera at someone's concard QR code.</p>

<div class="relative mt-4 overflow-hidden rounded-2xl bg-black" style="aspect-ratio: 3 / 4">
	<!-- live camera preview has no audio track -->
	<video bind:this={video} class="h-full w-full object-cover" playsinline muted></video>
	<div class="pointer-events-none absolute inset-0 grid place-items-center">
		<div
			class="h-56 w-56 rounded-2xl border-4 border-amber-300/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
		></div>
	</div>
	{#if status !== 'scanning'}
		<div class="absolute inset-0 grid place-items-center bg-slate-950/80 p-6 text-center text-sm">
			{#if status === 'starting'}Starting camera…
			{:else if status === 'found'}Found one!
			{:else if status === 'denied'}
				<p>
					Camera access was blocked. Allow it in your browser settings, or type a username below.
				</p>
			{:else}
				<p>This browser can't use the camera here. Type a username below instead.</p>
			{/if}
		</div>
	{/if}
</div>

{#if bad}<p class="mt-2 text-sm text-rose-300" role="alert">{bad}</p>{/if}

<form
	class="mt-6 flex gap-2"
	onsubmit={(e) => {
		e.preventDefault();
		handle(manual);
	}}
>
	<input class="field" placeholder="or type a username" autocapitalize="off" bind:value={manual} />
	<button class="btn-secondary">Go</button>
</form>

<p class="mt-6 text-xs text-white/40">
	No app? Any camera app works too: the code is just a link to their card.
</p>
