/**
 * The sticker fonts, under the family names the app registers them as, so the
 * fandom renderer copied from concard-app (fandom-styles.ts) works unchanged.
 * The TTFs are the app's own, served from static/fonts/stickers/ and declared
 * in routes/layout.css.
 */
export const font = {
	display: 'Fredoka-Bold',
	displaySemi: 'Fredoka-SemiBold',
	bodyMedium: 'SpaceGrotesk-Medium',
	bodyBold: 'SpaceGrotesk-Bold'
} as const;
