/**
 * Visual tokens for the card. Frames are gradients (the angle is what makes
 * them read as metal), backgrounds are flat tints, and everything the face
 * draws in is derived from the background so a dark card inverts cleanly.
 * Mirrors the cards_style_shape check constraint in the database.
 */

export const FRAMES = {
	silver:
		'linear-gradient(140deg,#fdfdff 0%,#b4b8c4 26%,#f4f5f9 46%,#8f96a5 66%,#eceef3 88%,#c3c7d1 100%)',
	gold: 'linear-gradient(140deg,#fff6d8 0%,#d8ab4e 30%,#fffbe9 50%,#bd8c33 70%,#ffefc0 100%)',
	holo: 'linear-gradient(118deg,#ffb3e0,#b9c9ff,#9ff0dc,#ffe7a8,#ffb3e0)',
	ink: 'linear-gradient(140deg,#4a4756,#17161b 60%,#3a3844)'
} as const;

export const BGS = {
	paper: '#fbf9f3',
	mint: '#e7f8f1',
	sky: '#eaeeff',
	blush: '#fdeaf3',
	butter: '#fff5d9',
	slate: '#22202c'
} as const;

export const SHAPES = ['rect', 'rounded', 'shaved'] as const;
export const PHOTO_SHAPES = ['square', 'round', 'arch', 'circle'] as const;

export type FrameKey = keyof typeof FRAMES;
export type BgKey = keyof typeof BGS;
export type Shape = (typeof SHAPES)[number];
export type PhotoShape = (typeof PHOTO_SHAPES)[number];

export interface CardStyle {
	frame: FrameKey;
	bg: BgKey;
	shape: Shape;
	photo_shape: PhotoShape;
}

export const DEFAULT_STYLE: CardStyle = {
	frame: 'silver',
	bg: 'paper',
	shape: 'rounded',
	photo_shape: 'round'
};

export const FRAME_KEYS = Object.keys(FRAMES) as FrameKey[];
export const BG_KEYS = Object.keys(BGS) as BgKey[];

const isFrame = (v: unknown): v is FrameKey => typeof v === 'string' && v in FRAMES;
const isBg = (v: unknown): v is BgKey => typeof v === 'string' && v in BGS;
const isShape = (v: unknown): v is Shape => SHAPES.includes(v as Shape);
const isPhotoShape = (v: unknown): v is PhotoShape => PHOTO_SHAPES.includes(v as PhotoShape);

/** Read a style out of untrusted JSON, filling defaults for anything missing or invalid. */
export function normalizeStyle(input: unknown): CardStyle {
	const s = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
	return {
		frame: isFrame(s.frame) ? s.frame : DEFAULT_STYLE.frame,
		bg: isBg(s.bg) ? s.bg : DEFAULT_STYLE.bg,
		shape: isShape(s.shape) ? s.shape : DEFAULT_STYLE.shape,
		photo_shape: isPhotoShape(s.photo_shape) ? s.photo_shape : DEFAULT_STYLE.photo_shape
	};
}

/** A pleasant starting look for a brand-new card, so it never reads as unfinished. */
export function randomStyle(rand: () => number = Math.random): CardStyle {
	const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
	return {
		frame: pick(['silver', 'gold'] as const),
		bg: pick(['paper', 'mint', 'sky', 'blush', 'butter'] as const),
		shape: 'rounded',
		photo_shape: pick(['round', 'arch'] as const)
	};
}

export interface FaceInk {
	dark: boolean;
	/** borders, rules, name */
	ink: string;
	/** handle, labels, +N MORE */
	mute: string;
	/** bio text */
	body: string;
	/** chip and panel fill */
	wash: string;
	/** empty photo hatch pair */
	hatchA: string;
	hatchB: string;
}

/** The four text values and hatch pair, derived from the background token. */
export function inkFor(bg: BgKey): FaceInk {
	const dark = bg === 'slate';
	return {
		dark,
		ink: dark ? '#f2efe6' : '#17161b',
		mute: dark ? '#a9a4b8' : '#5f5a50',
		body: dark ? '#ded9e6' : '#3b382f',
		wash: dark ? 'rgb(255 255 255 / 0.07)' : 'rgb(255 255 255 / 0.55)',
		hatchA: dark ? '#2b2937' : '#e9e5d8',
		hatchB: dark ? '#332f40' : '#f3f0e6'
	};
}

export const FRAME_LABEL: Record<FrameKey, string> = {
	silver: 'Silver',
	gold: 'Gold',
	holo: 'Holo',
	ink: 'Ink'
};
export const BG_LABEL: Record<BgKey, string> = {
	paper: 'Paper',
	mint: 'Mint',
	sky: 'Sky',
	blush: 'Blush',
	butter: 'Butter',
	slate: 'Slate'
};
export const SHAPE_LABEL: Record<Shape, string> = {
	rect: 'Square corners',
	rounded: 'Rounded',
	shaved: 'Shaved'
};
export const PHOTO_SHAPE_LABEL: Record<PhotoShape, string> = {
	square: 'Square',
	round: 'Rounded',
	arch: 'Arch',
	circle: 'Circle'
};

/** Sticker disc colour pairs, by rarity. */
export const STICKER_PAIRS = {
	common: ['#ffe29a', '#f6a623'],
	uncommon: ['#a7f3d0', '#10b981'],
	rare: ['#c4b5fd', '#7c3aed'],
	legendary: ['#fda4af', '#f43f5e']
} as const;

/** Small deterministic rotation (−8°…8°) so a row of discs never looks mechanical. */
export function stickerRotation(id: string): number {
	let h = 0;
	for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
	return ((Math.abs(h) % 1600) / 100) * (h % 2 === 0 ? 1 : -1);
}

/** Sticker position range on the card face (0..1); stickers may overhang the edge. */
export const STICKER_X_RANGE = [-0.14, 1.02] as const;
export const STICKER_Y_RANGE = [-0.1, 0.96] as const;
