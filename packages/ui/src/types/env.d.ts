// Fonts, images and sounds are inlined as data URLs by @app/dashboard-build
declare module '*.woff2' {
	const dataUrl: string;
	export default dataUrl;
}

declare module '*.webp' {
	const dataUrl: string;
	export default dataUrl;
}

declare module '*.mp3' {
	const dataUrl: string;
	export default dataUrl;
}

declare module '*.css' {
	const content: string;
	export default content;
}

// Compiled Tailwind CSS per panel, injected ahead of each bundle by @app/dashboard-build
declare var __panelStyles: Record<string, string> | undefined;

interface Window {
	webkitAudioContext?: typeof AudioContext;
}
