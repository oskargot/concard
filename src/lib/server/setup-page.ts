/**
 * Shown instead of a bare 500 when the server has no Supabase configuration.
 * Names the missing variables so a fresh deploy is easy to diagnose, but never
 * echoes any values.
 */
export function setupPage(missing: string[]): Response {
	const list = missing.map((m) => `<li><code>${m}</code></li>`).join('');
	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>concard · setup needed</title>
<style>
  body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#0f172a;color:#f8fafc;font:16px/1.5 system-ui,sans-serif;padding:24px}
  main{max-width:34rem}
  h1{font-size:1.5rem;margin:0 0 .5rem}
  code{background:rgba(255,255,255,.1);padding:.1em .4em;border-radius:.3em}
  ol,ul{padding-left:1.25rem}
  p,li{color:rgba(248,250,252,.85)}
</style>
</head>
<body>
<main>
<p style="letter-spacing:.3em;text-transform:uppercase;font-size:.75rem;color:#fbbf24;margin:0">concard</p>
<h1>Almost there: the server needs its Supabase settings</h1>
<p>This deploy is missing:</p>
<ul>${list}</ul>
<p>Add them as environment variables in your hosting dashboard (Netlify: Site configuration → Environment variables), then trigger a new deploy. Variables added after a build only apply to the next build.</p>
<p>Both values come from Supabase → Project Settings → API Keys.</p>
</main>
</body>
</html>`;
	return new Response(html, {
		status: 503,
		headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
	});
}
