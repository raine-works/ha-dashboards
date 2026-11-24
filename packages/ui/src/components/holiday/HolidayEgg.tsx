/**
 * The holidays' and birthdays' easter eggs: their characters in the header (a tap toasts a greeting
 * and plays a sound), peeking in for an icon, and marking a calendar day.
 *
 * @module
 */

import type React from 'preact/compat';
import { lazy, Suspense, useState } from 'preact/compat';
import { useHassApi } from '../../context/HassContext';
import { useWallPanel } from '../../context/WallPanel';
import { birthdayMessage } from '../../lib/birthdays';
import { holidayMutedUntil } from '../../lib/holidayMute';
import { type CharacterId, holidayMessage, holidayOn } from '../../lib/holidays';
import { nameList } from '../../lib/text';
import { cn } from '../../lib/utils';
import { toast } from '../ui';
import { playHolidaySound } from './holidaySounds';
import { useBirthdays } from './useBirthdays';
import { useHoliday } from './useHoliday';

export { useBirthdays } from './useBirthdays';
export { useHoliday } from './useHoliday';

// The drawings (~11KB with their memoization) load the first time one shows, in a chunk of their own
const HolidayArt = lazy(() => import('./HolidayArt'));

/** A holiday's or birthday's character (drawn in HolidayArt.tsx), an empty box of its size until the drawings load. */
export const HolidayCharacter: React.FC<{ id: CharacterId; animated?: boolean; className?: string }> = (props) => (
	<Suspense fallback={<span aria-hidden="true" className={cn('block shrink-0', props.className)} />}>
		<HolidayArt {...props} />
	</Suspense>
);

/** The colors a tap's confetti comes in, per holiday (and birthdays). */
const HOLIDAY_CONFETTI: Record<CharacterId, string[]> = {
	birthday: ['#f472b6', '#facc15', '#a78bfa', '#38bdf8'],
	'new-year': ['#facc15', '#c084fc', '#f472b6', '#38bdf8'],
	valentines: ['#fb7185', '#f472b6', '#e11d48', '#fda4af'],
	'st-patricks': ['#4ade80', '#16a34a', '#facc15', '#86efac'],
	easter: ['#c4b5fd', '#f9a8d4', '#fde047', '#7dd3fc'],
	'mothers-day': ['#f9a8d4', '#fde047', '#f472b6', '#4ade80'],
	'fathers-day': ['#60a5fa', '#1d4ed8', '#a8a29e', '#38bdf8'],
	'independence-day': ['#ef4444', '#60a5fa', '#e5e7eb', '#1d4ed8'],
	halloween: ['#fb923c', '#a855f7', '#4ade80', '#f97316'],
	thanksgiving: ['#f87171', '#fb923c', '#facc15', '#c2773a'],
	christmas: ['#ef4444', '#22c55e', '#facc15', '#e5e7eb'],
};

/** Where a tap's confetti flies: eight pieces around the character, in px. */
const BURST = Array.from({ length: 8 }, (_, i) => {
	const angle = (i / 8) * Math.PI * 2 - Math.PI / 2 + (i % 2 ? 0.2 : 0);
	const distance = i % 2 ? 15 : 20;
	return { dx: Math.round(Math.cos(angle) * distance), dy: Math.round(Math.sin(angle) * distance) };
});

/**
 * A character in the headers: a tap makes it hop, throws a little confetti (CSS only, drawn outside
 * its box, so nothing moves), plays its sound on the wall panels and toasts `message` for the tap
 * (the first is 0).
 */
const CharacterEgg: React.FC<{
	id: CharacterId;
	label: string;
	message: (tap: number) => string;
	className?: string;
}> = ({ id, label, message, className }) => {
	const wallPanel = useWallPanel();
	const { getHass } = useHassApi();
	const [taps, setTaps] = useState(0);
	const colors = HOLIDAY_CONFETTI[id];

	const onTap = () => {
		// Its sound is the wall panels' only (phones and desktops stay quiet), and not while muted
		if (wallPanel && holidayMutedUntil(getHass()?.states) === null) void playHolidaySound(id);
		toast(message(taps), { id: `egg-${id}`, icon: <HolidayCharacter id={id} className="size-6" /> });
		setTaps(taps + 1);
	};

	return (
		<button
			type="button"
			onClick={onTap}
			aria-label={label}
			className={cn(
				// A bigger touch target than the drawing, reaching into the space around it
				'relative flex size-6 shrink-0 items-center justify-center rounded-md outline-none before:absolute before:-inset-2 focus-visible:ring-[3px] focus-visible:ring-ring/50',
				className,
			)}
		>
			{/* Keyed by the tap, so each one hops and bursts again */}
			<span key={taps} className={cn('flex size-full', taps > 0 && 'holiday-hop')}>
				<HolidayCharacter id={id} animated className="size-full" />
			</span>
			{taps > 0 && (
				<span key={`burst-${taps}`} aria-hidden="true" className="pointer-events-none absolute inset-1/2">
					{BURST.map(({ dx, dy }, i) => (
						<span
							key={`${dx},${dy}`}
							className={cn('holiday-burst absolute size-1.5', i % 3 ? 'rounded-full' : 'rounded-[1px]')}
							style={{ '--dx': `${dx}px`, '--dy': `${dy}px`, backgroundColor: colors[i % colors.length] }}
						/>
					))}
				</span>
			)}
		</button>
	);
};

/**
 * The holiday's character beside the date in the headers, in the days leading up to it and on the
 * day: a tap toasts a countdown or greeting, then its fun lines in turn. Nothing on other days.
 */
export const HolidayEgg: React.FC<{ className?: string }> = ({ className }) => {
	const active = useHoliday();
	if (!active) return null;
	const { holiday } = active;
	return (
		<CharacterEgg
			id={holiday.id}
			label={active.isDay ? active.day.name : `${holiday.name} is coming`}
			message={(tap) => holidayMessage(active, tap)}
			className={className}
		/>
	);
};

/**
 * A cupcake beside the date on someone's birthday (the Birthdays calendar): a tap wishes them a
 * happy birthday, then its fun lines in turn. Nothing on other days.
 */
export const BirthdayEgg: React.FC<{ className?: string }> = ({ className }) => {
	const names = useBirthdays();
	if (names.length === 0) return null;
	return (
		<CharacterEgg
			id="birthday"
			label={`${nameList(names)}'s birthday`}
			message={(tap) => birthdayMessage(names, tap)}
			className={className}
		/>
	);
};

/**
 * An empty state's icon ("You're all caught up", nothing left to do): the holiday's character
 * peeking in while one is near, else the usual icon (or nothing, as company for another picture).
 */
export const HolidayPeek: React.FC<{ fallback?: React.ReactElement; className?: string }> = ({
	fallback,
	className,
}) => {
	const active = useHoliday();
	return active ? <HolidayCharacter id={active.holiday.id} animated className={className} /> : (fallback ?? null);
};

/**
 * A holiday's character on its own days in a calendar's day cell, else the cupcake on a day with a
 * `birthday` (the caller knows its events); nothing on other days.
 */
export const HolidayDayMark: React.FC<{ day: Date; birthday?: boolean; className?: string }> = ({
	day,
	birthday = false,
	className,
}) => {
	const holiday = holidayOn(day);
	if (!holiday && !birthday) return null;
	return (
		<span title={holiday ? holiday.day.name : 'Birthday'} className={cn('pointer-events-none', className)}>
			<HolidayCharacter id={holiday ? holiday.holiday.id : 'birthday'} className="size-full" />
		</span>
	);
};
