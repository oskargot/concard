/**
 * The QR on a card back, as the module matrix itself — concard-app's
 * `CardQr.tsx`: 150 units square *including* a 4-module quiet zone, one
 * rectangle per horizontal run of dark modules so neighbours share no
 * anti-aliased seam for a camera to misread.
 */
import QRCode from 'qrcode';
import { BACK } from '$lib/app-card/layout/spec';

export interface QrPath {
	/** The dark modules as one path, in module units with the quiet zone. */
	path: string;
	/** Modules across, quiet zone included (the viewBox). */
	total: number;
}

export function qrPath(value: string): QrPath {
	const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
	const n = qr.modules.size;
	const q = BACK.quietModules;
	let d = '';
	for (let y = 0; y < n; y++) {
		let x = 0;
		while (x < n) {
			if (!qr.modules.data[y * n + x]) {
				x++;
				continue;
			}
			let run = 1;
			while (x + run < n && qr.modules.data[y * n + x + run]) run++;
			d += `M${x + q} ${y + q}h${run}v1h-${run}z`;
			x += run;
		}
	}
	return { path: d, total: n + q * 2 };
}

/**
 * Stand-in for a code not known yet: three finder squares and nothing else,
 * so it reads as a QR at a glance but can never be scanned as one.
 */
export function placeholderQrPath(): QrPath {
	const q = BACK.quietModules;
	const finder = (x: number, y: number) =>
		`M${x} ${y}h7v7h-7z M${x + 1} ${y + 1}v5h5v-5z M${x + 2} ${y + 2}h3v3h-3z`;
	return {
		path: `${finder(q, q)} ${finder(q + 22, q)} ${finder(q, q + 22)}`,
		total: 29 + q * 2
	};
}
