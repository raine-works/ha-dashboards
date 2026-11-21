import { useEffect, useState } from 'preact/compat';
import { linkedCamera } from '../lib/cameras';
import { watchLocation } from './useLinkedParams';

/**
 * A camera to open from the page's link (`?camera=<entity>`, e.g. a doorbell or package
 * notification's tap action), checked on load and on Home Assistant's in-app navigation (the
 * Companion app navigates to a notification's URL when it's already open). The parameter is taken
 * off the URL once read, so a reload doesn't open the camera again. `clear` when the viewer closes.
 */
export function useLinkedCamera(): [string | undefined, () => void] {
	const [camera, setCamera] = useState<string | undefined>();

	useEffect(
		() =>
			watchLocation(() => {
				const linked = linkedCamera(window.location.search);
				if (!linked) return;
				setCamera(linked);
				const url = new URL(window.location.href);
				url.searchParams.delete('camera');
				window.history.replaceState(window.history.state, '', url);
			}),
		[],
	);

	return [camera, () => setCamera(undefined)];
}
