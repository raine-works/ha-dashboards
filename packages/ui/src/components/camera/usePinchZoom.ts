import type React from 'preact/compat';
import { useState } from 'preact/compat';
import { INITIAL_PINCH, type PinchAction, pinchReducer } from '../../lib/zoom';

/**
 * Pinch to zoom (up to 5×, around the fingers), drag to pan while zoomed, double-tap to zoom in at
 * the tap or back out, and the wheel (a trackpad pinch, on desktop): `pinchReducer` over the view's
 * pointer events. The handlers go on the view; `style` on the layer that zooms (the video).
 * Unzoomed, a vertical swipe still scrolls the page. Gestures starting on a button (mute, the zoom
 * reset) or inside `data-zoom-ignore` (a clip's scrubber) are left to them. No refs, so the React Compiler keeps it.
 */
export function usePinchZoom(enabled: boolean) {
	const [state, setState] = useState(INITIAL_PINCH);
	const dispatch = (action: PinchAction) => setState((prev) => pinchReducer(prev, action));

	// A point relative to the view's center, and the view's size
	const locate = (e: { clientX: number; clientY: number; currentTarget: EventTarget | null }) => {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		return {
			point: { x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 },
			view: { width: rect.width, height: rect.height },
		};
	};

	const handlers = {
		onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
			const idle = Object.keys(state.pointers).length === 0;
			if (!enabled || (idle && (e.target as Element).closest('button, [data-zoom-ignore]'))) return;
			(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
			dispatch({ type: 'down', id: e.pointerId, point: locate(e).point });
		},
		onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
			if (enabled) dispatch({ type: 'move', id: e.pointerId, ...locate(e) });
		},
		onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
			if (enabled) dispatch({ type: 'up', id: e.pointerId, ...locate(e), at: e.timeStamp });
		},
		onPointerCancel: (e: React.PointerEvent<HTMLElement>) => {
			if (enabled) dispatch({ type: 'cancel', id: e.pointerId });
		},
		onWheel: (e: WheelEvent) => {
			if (!enabled) return;
			e.preventDefault();
			dispatch({ type: 'wheel', ...locate(e), deltaY: e.deltaY, pinch: e.ctrlKey });
		},
	};

	const { zoom, smooth } = state;
	return {
		zoom,
		reset: () => dispatch({ type: 'reset' }),
		handlers,
		/** On the view: unzoomed, a vertical swipe still scrolls the page; zoomed, every gesture is ours. */
		touchAction: enabled ? (zoom.scale > 1 ? 'none' : 'pan-y') : undefined,
		/** On the zooming layer. */
		style: {
			transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
			transition: smooth ? 'transform 200ms ease-out' : undefined,
			willChange: zoom.scale > 1 ? 'transform' : undefined,
		} as React.CSSProperties,
	};
}
