// The full CanvasKit build react-native-skia loads (LoadSkiaWeb.js imports the
// same file); its typings live on the package root.
declare module 'canvaskit-wasm/bin/full/canvaskit.js' {
	import CanvasKitInit from 'canvaskit-wasm';
	export default CanvasKitInit;
}
