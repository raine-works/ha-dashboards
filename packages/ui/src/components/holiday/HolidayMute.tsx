/**
 * Muting the holiday sounds for a while: when the mute ends, and the button that turns it on and off.
 *
 * @module
 */

import { Volume2, VolumeX } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useReducer } from 'preact/compat';
import { useHassApi, useHassSelector } from '../../context/HassContext';
import { useWallPanel } from '../../context/WallPanel';
import {
	HOLIDAY_MUTE_MS,
	holidayMuteCall,
	holidayMutedUntil,
	holidayMuteEntity,
	isHolidayMute,
} from '../../lib/holidayMute';
import { formatTime } from '../../lib/time';
import { cn } from '../../lib/utils';
import { Button, toast } from '../ui';
import { useHoliday } from './useHoliday';

/** When the holiday sounds' mute ends (epoch ms) while it's on, else null; re-renders as it ends. */
export function useHolidayMutedUntil(): number | null {
	// The stored end, not "muted now": a selector runs only on Home Assistant's updates
	const end = useHassSelector((hass) => holidayMutedUntil(hass?.states, 0), { watch: isHolidayMute });
	const [, expired] = useReducer((n: number) => n + 1, 0);
	useEffect(() => {
		if (end === null || end <= Date.now()) return;
		const timer = setTimeout(expired, end - Date.now() + 100);
		return () => clearTimeout(timer);
	}, [end]);
	return end !== null && end > Date.now() ? end : null;
}

/**
 * Beside the holiday's character in the wall panels' header, in its days: a tap mutes the holiday's
 * sounds on every wall panel for an hour (the doors, the doorbell, the alarm, the character's taps;
 * the toasts still show), for an afternoon in and out of the door. Muted, it's an amber "Muted until
 * 8:15" that unmutes on a tap; it unmutes by itself at that time. Nothing elsewhere or on other days.
 */
export const HolidayMuteButton: React.FC<{ className?: string }> = ({ className }) => {
	const wallPanel = useWallPanel();
	const active = useHoliday();
	const { callService } = useHassApi();
	const until = useHolidayMutedUntil();
	// The integration's mute, else the house's own; none, nothing to mute
	const entity = useHassSelector((hass) => holidayMuteEntity(hass?.states), { watch: isHolidayMute });
	if (!wallPanel || !active || !entity) return null;
	const setMute = (until: number) => void callService(...holidayMuteCall(entity, until));

	const name = active.holiday.name;
	if (until !== null) {
		const time = formatTime(new Date(until));
		return (
			<Button
				variant="warning"
				size="sm"
				onClick={() => {
					setMute(Date.now());
					toast(`${name} sounds back on`, { id: 'holiday-mute' });
				}}
				aria-label={`${name} sounds muted until ${time}. Unmute`}
				title="Unmute"
				className={cn('shrink-0', className)}
			>
				<VolumeX />
				<span className="max-xl:hidden">Muted until</span>
				{time}
			</Button>
		);
	}
	return (
		<Button
			variant="ghost"
			size="icon-sm"
			onClick={() => {
				const end = Date.now() + HOLIDAY_MUTE_MS;
				setMute(end);
				toast(`${name} sounds muted until ${formatTime(new Date(end))}`, {
					id: 'holiday-mute',
					description: 'On every wall panel. Tap Muted to turn them back on sooner.',
				});
			}}
			aria-label={`Mute ${name} sounds for an hour`}
			title="Mute for an hour"
			className={cn('shrink-0 text-muted-foreground', className)}
		>
			<Volume2 />
		</Button>
	);
};
