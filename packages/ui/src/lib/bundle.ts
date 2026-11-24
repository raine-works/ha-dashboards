/**
 * Which dashboards bundle this page runs, so it can tell when a newer one is installed. The bundle is
 * dashboards-<hash>.js wherever it's served (the integration's /raineworks_dashboards/, or
 * anywhere else), so the running module's own URL names it, and version.json sits beside it.
 *
 * @module
 */

/** `dashboards-<hash>.js` from a bundle's URL; null when it isn't one (a dev or test build). */
export function bundleFile(url: string | undefined): string | null {
	if (!url) return null;
	const match = /\/(dashboards-[0-9a-f]{12}\.js)(?:[?#].*)?$/.exec(url);
	return match ? match[1] : null;
}

/** version.json beside a deployed bundle (it names the bundle installed last); null when it isn't one. */
export function versionUrl(url: string | undefined): string | null {
	return url && bundleFile(url) ? new URL('version.json', url).href : null;
}
