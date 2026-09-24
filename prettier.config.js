/** @type {import("prettier").Config} */
const config = {
	useTabs: true,
	singleQuote: true,
	trailingComma: 'none',
	printWidth: 100,
	// core.autocrlf checks files out as CRLF on Windows; keep whichever a file
	// has so `prettier --check` judges style, not line endings.
	endOfLine: 'auto',
	plugins: ['prettier-plugin-svelte', 'prettier-plugin-tailwindcss'],
	overrides: [{ files: '*.svelte', options: { parser: 'svelte' } }],
	tailwindStylesheet: './src/routes/layout.css'
};

export default config;
