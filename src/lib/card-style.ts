/**
 * The card's style tokens: concard-app's `src/card/card-style.ts`, synced
 * verbatim into `app-card/` (scripts/sync-card-spec.mjs), so frames, faces,
 * the colour roles, `normalizeStyle` and `styleToJson` are the app's own.
 *
 * Only what the web needs beyond that lives here. The sticker ranges below
 * shadow the app file's: they follow the `sticker_placements` checks of
 * 20260924000003 (centres on the card, scale 0.5–2), which the app's copy
 * hasn't caught up with yet.
 */

export * from './app-card/card-style';

/**
 * A sticker's centre as 0..1 of the card: it can never leave the card, though
 * the sticker itself may hang past the edge. Mirrors the sticker_placements
 * range checks (20260924000003).
 */
export const STICKER_X_RANGE = [0, 1] as const;
export const STICKER_Y_RANGE = [0, 1] as const;
/** Scale clamps, as multiples of the sticker's base size (the same check). */
export const STICKER_SCALE_RANGE = [0.5, 2] as const;
