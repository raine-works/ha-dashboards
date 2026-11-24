/**
 * The Calendar dialog: a month of every calendar's events, and what's coming up.
 *
 * @module
 */

import { ChevronLeft, ChevronRight, Loader2, MapPin, RefreshCw } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useMemo, useState } from 'preact/compat';
import { useWallPanel } from '../../context/WallPanel';
import { birthdayName } from '../../lib/birthdays';
import {
	addDays,
	type CalendarEvent,
	eventsOnDay,
	formatEventTime,
	formatEventWhen,
	isSameDay,
	mapsUrl,
	monthGrid,
	startOfDay,
} from '../../lib/calendar';
import { cn } from '../../lib/utils';
import { HolidayDayMark } from '../holiday/HolidayEgg';
import {
	Alert,
	AlertDescription,
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '../ui';
import { useCalendarEvents } from './useCalendar';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Events listed in a day cell before "+N"; phones show dots instead
const CELL_EVENTS = 2;
const COMING_UP = 6;

/** {@link CalendarDialog}'s props. */
export interface CalendarDialogProps {
	/** Whether the dialog is open. */
	isOpen: boolean;
	/** Called when it's dismissed. */
	onClose: () => void;
}

/** Someone's birthday ("Sam Rivera's birthday"), on any calendar. */
const hasBirthday = (events: readonly CalendarEvent[]) => events.some((event) => birthdayName(event.summary) != null);

const Dot: React.FC<{ event: CalendarEvent; className?: string }> = ({ event, className }) => (
	<span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', event.calendar.color, className)} />
);

/** One day of the month grid: its number (today circled) and its first events. */
const DayCell: React.FC<{
	day: Date;
	events: CalendarEvent[];
	inMonth: boolean;
	today: boolean;
	selected: boolean;
	onSelect: () => void;
}> = ({ day, events, inMonth, today, selected, onSelect }) => (
	<button
		type="button"
		onClick={onSelect}
		aria-pressed={selected}
		aria-label={`${day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}, ${
			events.length === 0 ? 'no events' : `${events.length} ${events.length === 1 ? 'event' : 'events'}`
		}`}
		className={cn(
			'relative flex min-h-0 min-w-0 flex-col items-start gap-0.5 overflow-hidden bg-card p-1.5 text-left outline-none transition-colors hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset max-md:h-12 max-md:items-center',
			!inMonth && 'bg-muted/40 text-muted-foreground',
			selected && 'bg-accent hover:bg-accent',
		)}
	>
		<span
			className={cn(
				'flex size-6 shrink-0 items-center justify-center rounded-full text-sm tabular-nums',
				today && 'bg-primary font-semibold text-primary-foreground',
			)}
		>
			{day.getDate()}
		</span>
		{/* A holiday's character on its own days (Halloween's pumpkin, Christmas Eve's gingerbread), else a birthday's cupcake */}
		<HolidayDayMark
			day={day}
			birthday={hasBirthday(events)}
			className="absolute top-1.5 right-1.5 size-5 max-md:top-1 max-md:right-1 max-md:size-3.5"
		/>
		{/* Phones: a dot per event */}
		<span className="flex gap-0.5 md:hidden">
			{events.slice(0, 3).map((event) => (
				<Dot key={event.key} event={event} />
			))}
		</span>
		{events.slice(0, CELL_EVENTS).map((event) => (
			<span key={event.key} className="flex w-full min-w-0 items-center gap-1 text-xs max-md:hidden">
				<Dot event={event} />
				<span className={cn('truncate', event.allDay && 'font-medium')}>{event.summary}</span>
			</span>
		))}
		{events.length > CELL_EVENTS && (
			<span className="px-2.5 text-muted-foreground text-xs max-md:hidden">+{events.length - CELL_EVENTS} more</span>
		)}
	</button>
);

/**
 * Where an event is: a link to it in Google Maps on phones and desktops (`mapsUrl()`), plain text on
 * the wall panels, which never navigate away.
 */
const EventLocation: React.FC<{ location: string }> = ({ location }) => {
	const url = useWallPanel() ? null : mapsUrl(location);
	const content = (
		<>
			<MapPin className="size-3.5 shrink-0" />
			<span className="truncate">{location}</span>
		</>
	);
	return url ? (
		<a
			href={url}
			target="_blank"
			rel="noopener noreferrer"
			title="Open in Google Maps"
			className="flex min-w-0 items-center gap-1 self-start text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
		>
			{content}
		</a>
	) : (
		<span className="flex items-center gap-1 text-muted-foreground text-sm">{content}</span>
	);
};

const EventCard: React.FC<{ event: CalendarEvent }> = ({ event }) => (
	<li className="flex shrink-0 gap-3 rounded-lg border bg-card p-3">
		<span aria-hidden className={cn('w-1 shrink-0 self-stretch rounded-full', event.calendar.color)} />
		<div className="flex min-w-0 flex-col gap-0.5">
			<span className="wrap-break-word font-medium">{event.summary}</span>
			<span className="text-muted-foreground text-sm">
				{formatEventTime(event)} · {event.calendar.name}
			</span>
			{event.location && <EventLocation location={event.location} />}
			{event.description && (
				<p className="line-clamp-3 whitespace-pre-line text-muted-foreground text-xs">{event.description}</p>
			)}
		</div>
	</li>
);

/**
 * Every calendar (the family's Google Calendar, holidays) as a month grid, with the picked day's
 * events and what's coming up after it. Opens on today.
 */
export const CalendarDialog: React.FC<CalendarDialogProps> = ({ isOpen, onClose }) => {
	const [selected, setSelected] = useState(() => startOfDay(new Date()));
	const [month, setMonth] = useState(() => startOfDay(new Date()));

	// Every open starts on today
	useEffect(() => {
		if (!isOpen) return;
		const today = startOfDay(new Date());
		setSelected(today);
		setMonth(today);
	}, [isOpen]);

	// The grid changes with the month, not the day picked in it
	const monthKey = month.getFullYear() * 12 + month.getMonth();
	const days = useMemo(() => monthGrid(new Date(Math.floor(monthKey / 12), monthKey % 12, 1)), [monthKey]);
	const { calendars, events, loading, error, retry } = useCalendarEvents(days[0], addDays(days[41], 1), isOpen);

	const now = new Date();
	const dayEvents = eventsOnDay(events, selected);
	const comingUp = events.filter((e) => e.start >= addDays(selected, 1) && e.end > now).slice(0, COMING_UP);

	const showMonth = (offset: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1));
	const select = (day: Date) => {
		setSelected(day);
		// A day from the next or previous month shows that month
		if (day.getMonth() !== month.getMonth()) setMonth(day);
	};
	const goToday = () => {
		const today = startOfDay(new Date());
		setSelected(today);
		setMonth(today);
	};

	return (
		<Dialog open={isOpen} onOpenChange={(value) => !value && onClose()}>
			<DialogContent size="workspace">
				<DialogHeader>
					<DialogTitle>Calendar</DialogTitle>
					<DialogDescription>
						{calendars.length === 0 ? 'No calendars in Home Assistant yet' : calendars.map((c) => c.name).join(' · ')}
					</DialogDescription>
				</DialogHeader>

				{/* Month navigation and the calendars' colors */}
				<div className="flex shrink-0 flex-wrap items-center gap-2">
					<Button variant="outline" size="icon-lg" onClick={() => showMonth(-1)} aria-label="Previous month">
						<ChevronLeft />
					</Button>
					<Button variant="outline" size="icon-lg" onClick={() => showMonth(1)} aria-label="Next month">
						<ChevronRight />
					</Button>
					<h3 className="min-w-0 flex-1 truncate px-1 font-semibold text-lg">
						{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
					</h3>
					<div className="flex items-center gap-3 max-md:hidden">
						{calendars.map((c) => (
							<span key={c.entityId} className="flex items-center gap-1.5 text-muted-foreground text-sm">
								<span aria-hidden className={cn('size-2 rounded-full', c.color)} />
								{c.name}
							</span>
						))}
					</div>
					<Button variant="outline" size="lg" onClick={goToday}>
						Today
					</Button>
				</div>

				{error && (
					<Alert variant="destructive" className="shrink-0">
						<AlertDescription className="flex flex-wrap items-center justify-between gap-2">
							Couldn't load the calendars' events
							<Button variant="outline" size="sm" onClick={retry} loading={loading}>
								<RefreshCw />
								Try again
							</Button>
						</AlertDescription>
					</Alert>
				)}

				<div className="flex min-h-0 flex-1 gap-4 max-md:flex-col max-md:overflow-y-auto">
					{/* Month grid: six weeks, Sunday first */}
					<div className={cn('flex min-h-0 flex-1 flex-col gap-1 max-md:flex-none', loading && 'opacity-70')}>
						<div className="grid shrink-0 grid-cols-7 text-center font-medium text-muted-foreground text-xs">
							{WEEKDAYS.map((d) => (
								<span key={d}>{d}</span>
							))}
						</div>
						<div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-px overflow-hidden rounded-lg border bg-border">
							{days.map((day) => (
								<DayCell
									key={day.getTime()}
									day={day}
									events={eventsOnDay(events, day)}
									inMonth={day.getMonth() === month.getMonth()}
									today={isSameDay(day, now)}
									selected={isSameDay(day, selected)}
									onSelect={() => select(day)}
								/>
							))}
						</div>
					</div>

					{/* The picked day, then what's next */}
					<div className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto max-md:w-full max-md:overflow-visible">
						<div className="flex shrink-0 items-center gap-2">
							<h3 className="min-w-0 font-semibold">
								{isSameDay(selected, now) && 'Today · '}
								{selected.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
							</h3>
							<HolidayDayMark day={selected} birthday={hasBirthday(dayEvents)} className="size-6 shrink-0" />
						</div>
						{dayEvents.length === 0 ? (
							<p className="flex shrink-0 items-center gap-2 text-muted-foreground text-sm">
								{loading && <Loader2 className="size-4 animate-spin" />}
								{loading ? 'Loading…' : 'Nothing scheduled'}
							</p>
						) : (
							<ul className="flex flex-col gap-2">
								{dayEvents.map((event) => (
									<EventCard key={event.key} event={event} />
								))}
							</ul>
						)}

						{comingUp.length > 0 && (
							<>
								<h3 className="mt-2 shrink-0 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
									Coming up
								</h3>
								<ul className="flex flex-col divide-y rounded-lg border">
									{comingUp.map((event) => (
										<li key={event.key} className="shrink-0">
											<button
												type="button"
												onClick={() => select(startOfDay(event.start))}
												className="flex touch:min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left text-sm outline-none transition-colors hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
											>
												<Dot event={event} className="size-2" />
												<span className="min-w-0 flex-1 truncate">{event.summary}</span>
												<HolidayDayMark
													day={event.start}
													birthday={birthdayName(event.summary) != null}
													className="size-5 shrink-0"
												/>
												<span className="shrink-0 text-muted-foreground">{formatEventWhen(event, now)}</span>
											</button>
										</li>
									))}
								</ul>
							</>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
