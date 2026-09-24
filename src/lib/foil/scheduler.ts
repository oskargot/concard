/**
 * When each card's foil gets drawn.
 *
 * Every foil drawing on the page — a card's face, a card's stickers, a loose
 * sticker tile — is a plain 2D canvas registered here with a `draw` callback.
 * One `requestAnimationFrame` loop serves them all, and a canvas is only
 * redrawn when its inputs changed (the action's parameters were replaced) or
 * it is animating (the idle drift), and only while it is on screen. A binder
 * full of resting cards therefore costs one draw each, then nothing.
 *
 * The shared engine loads the first time anything registers.
 */

import { loadEngine, type FoilEngine } from './engine';

export interface FoilParams {
	/** Draw into `canvas` with the engine, at `time` seconds on the idle clock. */
	draw: (engine: FoilEngine, canvas: HTMLCanvasElement, time: number) => void;
	/** Redraw every frame (the idle drift), not only when parameters change. */
	animate?: boolean;
	/** Told once whether the engine is running, so a caller can swap fallbacks. */
	onready?: (ready: boolean) => void;
}

interface View {
	canvas: HTMLCanvasElement;
	params: FoilParams;
	dirty: boolean;
	visible: boolean;
}

const views = new Set<View>();
let engine: FoilEngine | null = null;
let failed = false;
let frame = 0;
let observer: IntersectionObserver | null = null;
const byElement = new WeakMap<Element, View>();

/** A pinned clock, for screenshots: every drift reads this instead. */
let pinnedTime: number | null = null;
let epoch = 0;

export function pinFoilClock(seconds: number | null) {
	pinnedTime = seconds;
	invalidateAll();
}

function now(): number {
	return pinnedTime ?? (performance.now() - epoch) / 1000;
}

function invalidateAll() {
	for (const v of views) v.dirty = true;
	schedule();
}

function schedule() {
	if (frame || !engine) return;
	frame = requestAnimationFrame(tick);
}

function tick() {
	frame = 0;
	if (!engine || engine.lost) return;
	const time = now();
	let again = false;
	for (const v of views) {
		if (!v.visible) continue;
		const animate = !!v.params.animate && pinnedTime === null;
		if (v.dirty || animate) {
			v.dirty = false;
			v.params.draw(engine, v.canvas, time);
		}
		again ||= animate;
	}
	if (again) schedule();
}

let starting: Promise<FoilEngine | null> | null = null;

function start(): Promise<FoilEngine | null> {
	starting ??= loadEngine().then((e) => {
		if (!e) {
			failed = true;
			for (const v of views) v.params.onready?.(false);
			return null;
		}
		engine = e;
		epoch = performance.now();
		for (const v of views) v.params.onready?.(true);
		invalidateAll();
		return e;
	});
	return starting;
}

function observe(v: View) {
	if (typeof IntersectionObserver === 'undefined') return;
	observer ??= new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				const view = byElement.get(entry.target);
				if (!view) continue;
				view.visible = entry.isIntersecting;
				if (view.visible) schedule();
			}
		},
		{ rootMargin: '200px' }
	);
	byElement.set(v.canvas, v);
	observer.observe(v.canvas);
}

/** Svelte action: `<canvas use:foil={{ draw, animate }}>`. */
export function foil(canvas: HTMLCanvasElement, params: FoilParams) {
	const view: View = { canvas, params, dirty: true, visible: true };
	views.add(view);
	observe(view);
	if (engine) params.onready?.(true);
	else if (failed) params.onready?.(false);
	start();
	schedule();
	return {
		update(next: FoilParams) {
			view.params = next;
			view.dirty = true;
			schedule();
		},
		destroy() {
			views.delete(view);
			observer?.unobserve(canvas);
		}
	};
}

/** The engine (starting it if need be); null when this browser can't run it. */
export function foilEngine(): Promise<FoilEngine | null> {
	return start();
}
