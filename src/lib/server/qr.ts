import QRCode from 'qrcode';

/** Render a QR code as an inline SVG string. */
export function qrSvg(text: string): Promise<string> {
	return QRCode.toString(text, {
		type: 'svg',
		margin: 0,
		errorCorrectionLevel: 'M',
		color: { dark: '#111111', light: '#ffffff' }
	});
}
