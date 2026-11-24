/**
 * The panel's alerts: toasts for doors and windows opening, doorbell rings and the alarm's
 * changes, the doorbell's live view, and the page's one Open Doors & Windows dialog.
 *
 * @module
 */

import type React from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/compat';
import type { ToasterProps } from 'sonner';
import { useHassApi, useHassSelector } from '../../context/HassContext';
import { useWallPanel } from '../../context/WallPanel';
import {
	type AlarmPanel,
	alarmEvents,
	alertsWatch,
	cameraForDoorbell,
	type Doorbell,
	discoverAlarmPanels,
	discoverDoorbells,
	discoverOpenings,
	endedAlarms,
	newlyOpened,
	newRings,
	type Opening,
	serverNow,
} from '../../lib/alerts';
import { homeBedtimeEntity } from '../../lib/bedtime';
import { discoverCameras } from '../../lib/cameras';
import { holidayMutedUntil } from '../../lib/holidayMute';
import { CameraModal } from '../camera/CameraModal';
import { playAlertHolidaySound } from '../holiday/holidaySounds';
import { Toaster, toast } from '../ui/sonner';
import { SharedOpenSensorsDialog, showOpenSensors } from './OpenSensorsDialog';

/** How long the doorbell live view stays up without interaction. */
export const DOORBELL_VIEW_MS = 3 * 60 * 1000;
const OPENED_TOAST_MS = 10_000;
const DOORBELL_TOAST_MS = 30_000;
const ALARM_TOAST_MS = 6_000;

/** {@link PanelAlerts}'s props. */
export interface PanelAlertsProps {
	/** Show a live view when a doorbell rings (default true). */
	doorbellPopup?: boolean;
	/** Toast inset on phones (under 600px), e.g. to clear a bottom tab bar. */
	mobileOffset?: ToasterProps['mobileOffset'];
	/** Toast inset from 600px up (a tab bar on a portrait tablet or a phone on its side). */
	offset?: ToasterProps['offset'];
}

/**
 * Bottom-left toasts for panel events, colored by type (see components/ui/sonner):
 *  - red (error):    alarm triggered, until the alarm state changes
 *  - amber (warning): a door/window/garage opened ("View" lists everything open);
 *                     alarm entry delay, until the alarm state changes
 *  - blue (info):     doorbell ring (also opens the doorbell's live view), alarm arming
 *  - green (success): alarm armed / disarmed
 * Mount once per panel.
 */
export const PanelAlerts: React.FC<PanelAlertsProps> = ({ doorbellPopup = true, mobileOffset, offset }) => {
	const { getHass } = useHassApi();
	// What the toasts follow; the effect below runs only when one of these changes
	const wallPanel = useWallPanel();
	const watched = useHassSelector(
		(hass) =>
			hass && Object.keys(hass.states).length > 0
				? {
						openings: discoverOpenings(hass.states),
						doorbells: discoverDoorbells(hass.states),
						alarms: discoverAlarmPanels(hass.states),
					}
				: null,
		{ watch: alertsWatch(() => getHass()?.states) },
	);
	// Remount the camera view per ring so it always starts on the ringing doorbell
	const [doorbellView, setDoorbellView] = useState<{ camera: string; key: string } | null>(null);
	const openingsRef = useRef<Opening[]>();
	const doorbellsRef = useRef<Doorbell[]>();
	const alarmsRef = useRef<AlarmPanel[]>();

	useEffect(() => {
		if (!watched) return;
		const { openings, doorbells, alarms } = watched;
		// Only what happened just now alerts (a page waking from sleep sees hours of changes at once)
		const now = serverNow(getHass()?.states);

		// In a holiday's days, on the wall panels, a door, the doorbell and the alarm's arming, armed and
		// disarmed toasts play its sound (an owl's hoot, sleigh bells); never the triggered alarm or the
		// entry delay, and never while the house is in Home Bedtime or the sounds are muted (the header's
		// mute, for an hour in and out of the door): the toasts show, silently
		let holidaySound = false;

		// Doors & windows: toast each one that opens; drop its toast once it closes
		const openNow = openings.filter((o) => o.isOpen);
		for (const opening of newlyOpened(openingsRef.current, openings, now)) {
			holidaySound = true;
			toast.warning(`${opening.name} opened`, {
				id: `opening:${opening.entityId}`,
				description: openNow.length > 1 ? `${openNow.length} doors & windows open` : undefined,
				duration: OPENED_TOAST_MS,
				action: { label: 'View', onClick: showOpenSensors },
			});
		}
		for (const opening of openings) {
			if (!opening.isOpen) toast.dismiss(`opening:${opening.entityId}`);
		}
		openingsRef.current = openings;

		// Doorbells: toast and pop up the matching camera
		for (const ring of newRings(doorbellsRef.current, doorbells, now)) {
			holidaySound = true;
			const camera = cameraForDoorbell(ring.entityId, discoverCameras(getHass()?.states ?? {}));
			const showCamera = () => camera && setDoorbellView({ camera: camera.entityId, key: ring.lastEvent });
			toast.info('Someone is at the door', {
				id: `doorbell:${ring.entityId}`,
				description: camera?.label,
				duration: DOORBELL_TOAST_MS,
				action: camera ? { label: 'View', onClick: showCamera } : undefined,
			});
			if (doorbellPopup) showCamera();
		}
		doorbellsRef.current = doorbells;

		// Alarm: one toast per panel, replaced as the state moves on
		const events = alarmEvents(alarmsRef.current, alarms, now);
		// A triggered or entry delay toast lasts until the state changes; when that change isn't
		// announced (unavailable, or from before the page slept), it goes on its own
		for (const entityId of endedAlarms(alarmsRef.current, alarms)) {
			if (!events.some((e) => e.panel.entityId === entityId)) toast.dismiss(`alarm:${entityId}`);
		}
		for (const event of events) {
			const id = `alarm:${event.panel.entityId}`;
			const mode = event.modeLabel ? ` ${event.modeLabel}` : '';
			if (event.kind === 'triggered') {
				toast.error('Alarm triggered', { id, description: event.panel.name, duration: Number.POSITIVE_INFINITY });
			} else if (event.kind === 'pending') {
				toast.warning('Entry detected', {
					id,
					description: 'Disarm before the alarm sounds',
					duration: Number.POSITIVE_INFINITY,
				});
			} else if (event.kind === 'arming') {
				holidaySound = true;
				toast.info(`Arming${mode}`, { id, description: 'Exit delay started', duration: ALARM_TOAST_MS });
			} else if (event.kind === 'armed') {
				holidaySound = true;
				toast.success(`Armed${mode}`, { id, duration: ALARM_TOAST_MS });
			} else {
				holidaySound = true;
				toast.success('Alarm disarmed', { id, duration: ALARM_TOAST_MS });
			}
		}
		alarmsRef.current = alarms;
		const states = getHass()?.states;
		const houseAsleep = states?.[homeBedtimeEntity(states)]?.state === 'on';
		const muted = holidayMutedUntil(states) !== null;
		if (holidaySound && wallPanel && !houseAsleep && !muted) playAlertHolidaySound();
	}, [watched, doorbellPopup, wallPanel]);

	return (
		<>
			<Toaster position="bottom-left" visibleToasts={4} mobileOffset={mobileOffset} offset={offset} />
			<SharedOpenSensorsDialog />
			{doorbellView && (
				<CameraModal
					key={doorbellView.key}
					isOpen
					initialCamera={doorbellView.camera}
					idleTimeoutMs={DOORBELL_VIEW_MS}
					onClose={() => setDoorbellView(null)}
				/>
			)}
		</>
	);
};
