import { CalendarIcon, Clock, X } from 'lucide-react';
import type React from 'preact/compat';
import { useState } from 'preact/compat';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import {
	DEFAULT_TIME,
	dayKey,
	fromWheelTime,
	HOURS,
	type Meridiem,
	MINUTES,
	parseDay,
	quickPicks,
	toWheelTime,
} from '../../lib/picker';
import { type Due, formatDue } from '../../lib/todo';
import { cn } from '../../lib/utils';
import {
	Button,
	ChipRow,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	MonthSwiper,
	Popover,
	PopoverContent,
	PopoverTrigger,
	WheelPicker,
} from '../ui';

/** Phones get a bottom sheet; the panels and desktops a popover by the button. */
const PHONE_QUERY = '(max-width: 639px)';

const HOUR_ITEMS = HOURS.map((h) => ({ value: h, label: String(h) }));
const MINUTE_ITEMS = MINUTES.map((m) => ({ value: m, label: m.toString().padStart(2, '0') }));
const MERIDIEM_ITEMS: { value: Meridiem; label: string }[] = [
	{ value: 'AM', label: 'AM' },
	{ value: 'PM', label: 'PM' },
];

/** "Tomorrow", "Sat 5:30 PM", "Oct 31" (no "Overdue": that's the item's badge). */
const dueLabel = (due: Due) =>
	formatDue(due.time ? `${due.date}T${due.time}` : due.date).label.replace(/^Overdue · /, '');

const firstOfMonth = (day: string | undefined) => {
	const date = day ? parseDay(day) : new Date();
	return new Date(date.getFullYear(), date.getMonth(), 1);
};

export interface DueDatePickerProps {
	value: Due | null;
	onChange: (due: Due | null) => void;
	/** The list takes a time of day too (SET_DUE_DATETIME). */
	withTime?: boolean;
	/** Opened or closed (the selection's picker applies its pick once it closes). */
	onOpenChange?: (open: boolean) => void;
	className?: string;
}

/**
 * What the picker holds: quick picks (Today, Tomorrow, the weekend, next week), a month that swipes to
 * the next and previous (MonthSwiper), and for lists that take one, a time on iOS-style wheels (hour,
 * minute in 5s, AM/PM) or none. Every change applies at once; Clear removes the due date.
 */
const DuePickerBody: React.FC<{
	value: Due | null;
	onChange: (due: Due | null) => void;
	withTime: boolean;
	onDone: () => void;
	/** Wheels beside the month (popover) or under it (the phone's sheet). */
	stacked: boolean;
}> = ({ value, onChange, withTime, onDone, stacked }) => {
	const [month, setMonth] = useState(() => firstOfMonth(value?.date));
	const pickDay = (day: string) => {
		onChange({ date: day, time: value?.time });
		setMonth(firstOfMonth(day));
	};
	// A time without a day means today
	const setTime = (time: string | undefined) => onChange({ date: value?.date ?? dayKey(new Date()), time });
	const wheel = toWheelTime(value?.time ?? DEFAULT_TIME);
	const setWheel = (patch: Partial<typeof wheel>) => setTime(fromWheelTime({ ...wheel, ...patch }));

	return (
		// min-w-0: in the dialog's grid, the chips' row would otherwise widen the sheet past the screen
		<div className="flex min-w-0 flex-col gap-4">
			{/* One row (scrolling sideways on the narrowest phones) */}
			<ChipRow>
				{quickPicks().map((pick) => (
					<Button
						key={pick.label}
						variant={value?.date === pick.day ? 'default' : 'outline'}
						size="sm"
						onClick={() => pickDay(pick.day)}
					>
						{pick.label}
					</Button>
				))}
			</ChipRow>
			<div className={cn('flex gap-6', stacked ? 'flex-col items-center' : 'items-start')}>
				<MonthSwiper month={month} onMonthChange={setMonth} selected={value?.date} onSelect={pickDay} />
				{withTime && (
					<div className={cn('flex items-center gap-2', stacked ? 'flex-row' : 'flex-col border-l pl-6')}>
						{value?.time ? (
							<>
								<div className="flex items-center gap-1">
									<WheelPicker
										items={HOUR_ITEMS}
										value={wheel.hour}
										onChange={(hour) => setWheel({ hour })}
										label="Hour"
									/>
									<span className="font-semibold text-lg">:</span>
									<WheelPicker
										items={MINUTE_ITEMS}
										value={wheel.minute}
										onChange={(minute) => setWheel({ minute })}
										label="Minute"
									/>
									<WheelPicker
										items={MERIDIEM_ITEMS}
										value={wheel.meridiem}
										onChange={(meridiem) => setWheel({ meridiem })}
										label="AM or PM"
									/>
								</div>
								<Button variant="ghost" size="sm" onClick={() => setTime(undefined)}>
									<X />
									No time
								</Button>
							</>
						) : (
							<Button variant="outline" size="lg" onClick={() => setTime(DEFAULT_TIME)}>
								<Clock />
								Add a time
							</Button>
						)}
					</div>
				)}
			</div>
			{/* Always in reach: on a phone's sheet it sticks to the bottom while the rest scrolls */}
			<div
				className={cn(
					'flex items-center justify-between gap-2 border-t pt-3',
					// The phone's sheet: the two share its full width, like every dialog's bottom buttons
					stacked &&
						'sticky bottom-0 -mx-4 -mb-4 bg-background px-4 pb-[max(--spacing(4),env(safe-area-inset-bottom))] *:flex-1',
				)}
			>
				<Button
					variant={stacked ? 'outline' : 'ghost'}
					size="lg"
					onClick={() => {
						onChange(null);
						onDone();
					}}
					disabled={!value}
				>
					<X />
					Clear
				</Button>
				<Button size="lg" onClick={onDone}>
					Done
				</Button>
			</div>
		</div>
	);
};

/**
 * The to-do due date picker: quick picks, a swipeable month and time wheels, in a popover by its
 * button on the panels and desktops and a bottom sheet on phones (a Dialog, so it stacks, blurs the
 * page and closes on Escape like one). Native scroll physics for the month and the wheels; never the
 * system's own picker.
 */
export const DueDatePicker: React.FC<DueDatePickerProps> = ({
	value,
	onChange,
	withTime = false,
	onOpenChange,
	className,
}) => {
	const [open, setShown] = useState(false);
	const setOpen = (next: boolean) => {
		setShown(next);
		onOpenChange?.(next);
	};
	const phone = useMediaQuery(PHONE_QUERY);

	const trigger = (
		<Button
			variant="outline"
			size="xl"
			onClick={phone ? () => setOpen(true) : undefined}
			aria-label={value ? `Due ${dueLabel(value)}` : 'Due date'}
			// As wide as "Today 9:00 AM" needs, never narrower than a bare "Due date"
			className={cn('min-w-44 max-w-60 justify-start px-4 has-[>svg]:px-4', className)}
		>
			<CalendarIcon />
			<span className={cn('truncate', !value && 'text-muted-foreground')}>{value ? dueLabel(value) : 'Due date'}</span>
		</Button>
	);
	const body = (
		<DuePickerBody
			value={value}
			onChange={onChange}
			withTime={withTime}
			onDone={() => setOpen(false)}
			stacked={phone}
		/>
	);

	if (phone)
		return (
			<>
				{trigger}
				<Dialog open={open} onOpenChange={setOpen}>
					{/* A sheet from the bottom edge: layout overrides of the phone's full-screen dialog */}
					<DialogContent className="max-sm:top-auto max-sm:max-h-[calc(var(--panel-height)-2rem)] max-sm:animate-sheet-in max-sm:rounded-t-2xl max-sm:border-t">
						<DialogHeader>
							<DialogTitle>Due</DialogTitle>
							<DialogDescription className="sr-only">Pick a day{withTime ? ' and a time' : ''}</DialogDescription>
						</DialogHeader>
						{body}
					</DialogContent>
				</Dialog>
			</>
		);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent align="start" className="w-auto p-4">
				{body}
			</PopoverContent>
		</Popover>
	);
};
