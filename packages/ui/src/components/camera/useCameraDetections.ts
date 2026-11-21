import { useEffect, useState } from 'preact/compat';
import { useHassSelector } from '../../context/HassContext';
import { CAMERA_ACTIVITY_WATCH, type CameraDetection, cameraDetections, discoverCameras } from '../../lib/cameras';

// A package detection expires on time, not on a state change, so re-check while one is showing
const EXPIRY_CHECK_MS = 15_000;

/** Smart detections active now on the camera with this UniFi Protect prefix. */
export function useCameraDetections(prefix: string): CameraDetection[] {
	const [now, setNow] = useState(() => Date.now());
	const detections = useHassSelector((hass) => cameraDetections(hass?.states ?? {}, prefix, now), {
		watch: (id) => id.startsWith(`binary_sensor.${prefix}_`) || id === `event.${prefix}_package`,
	});
	const hasPackage = detections.some((d) => d.type === 'package');

	// A new event state re-renders with the old `now`; refresh it so a just-fired package counts
	const packageState = useHassSelector((hass) => hass?.states[`event.${prefix}_package`]?.state, {
		watch: (id) => id === `event.${prefix}_package`,
	});
	useEffect(() => setNow(Date.now()), [packageState]);
	useEffect(() => {
		if (!hasPackage) return;
		const timer = setInterval(() => setNow(Date.now()), EXPIRY_CHECK_MS);
		return () => clearInterval(timer);
	}, [hasPackage]);

	return detections;
}

export interface CameraActivity {
	cameraLabel: string;
	detections: CameraDetection[];
}

/** Every camera with an active smart detection, for at-a-glance alerts (the header's Cameras button). */
export function useCameraActivity(): CameraActivity[] {
	const [now, setNow] = useState(() => Date.now());
	const { activity, packageStates } = useHassSelector(
		(hass) => {
			const states = hass?.states ?? {};
			const cameras = discoverCameras(states);
			return {
				activity: cameras
					.map((camera) => ({ cameraLabel: camera.label, detections: cameraDetections(states, camera.id, now) }))
					.filter((entry) => entry.detections.length > 0),
				// Same expiry handling as useCameraDetections, across all cameras
				packageStates: cameras.map((camera) => states[`event.${camera.id}_package`]?.state).join(','),
			};
		},
		{ watch: CAMERA_ACTIVITY_WATCH },
	);
	const hasPackage = activity.some((entry) => entry.detections.some((d) => d.type === 'package'));

	useEffect(() => setNow(Date.now()), [packageStates]);
	useEffect(() => {
		if (!hasPackage) return;
		const timer = setInterval(() => setNow(Date.now()), EXPIRY_CHECK_MS);
		return () => clearInterval(timer);
	}, [hasPackage]);

	return activity;
}
