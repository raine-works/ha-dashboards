import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'preact/compat';
import { monthGrid } from '../../lib/calendar';
import { cn } from '../../lib/utils';
import { Button, type ButtonProps, buttonVariants } from './button';

// shadcn/ui calendar (new-york v4) without react-day-picker (and its date-fns, ~95KB a panel): the
// same markup, classes and data attributes for single-date picking. Six weeks a month, always, so
// paging months never changes its height. Arrow keys move the focused day (Page Up/Down: months).

const sameDay = (a: Date | undefined, b: Date | undefined) =>
	!!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const addMonths = (date: Date, months: number) => new Date(date.getFullYear(), date.getMonth() + months, 1);

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export interface CalendarProps {
	/** Only single-date picking is ported. */
	mode?: 'single';
	selected?: Date;
	onSelect?: (date: Date | undefined) => void;
	/** The month shown first (default: the selected one, else this month). */
	defaultMonth?: Date;
	showOutsideDays?: boolean;
	disabled?: (date: Date) => boolean;
	buttonVariant?: ButtonProps['variant'];
	className?: string;
}

function Calendar({
	selected,
	onSelect,
	defaultMonth,
	showOutsideDays = true,
	disabled,
	buttonVariant = 'ghost',
	className,
}: CalendarProps) {
	const [month, setMonth] = useState(() => startOfMonth(defaultMonth ?? selected ?? new Date()));
	const [focused, setFocused] = useState<Date | null>(null);
	const grid = useRef<HTMLTableElement>(null);
	const today = new Date();
	const days = monthGrid(month);
	const weeks = Array.from({ length: 6 }, (_, i) => days.slice(i * 7, i * 7 + 7));

	// Keyboard focus follows the focused day (paging the month first when it leaves it)
	useEffect(() => {
		if (!focused) return;
		grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focused.toDateString()}"]`)?.focus();
	}, [focused, month]);

	const moveFocus = (to: Date) => {
		if (to.getMonth() !== month.getMonth() || to.getFullYear() !== month.getFullYear()) setMonth(startOfMonth(to));
		setFocused(to);
	};
	const onKeyDown = (e: KeyboardEvent, day: Date) => {
		const step: Record<string, () => Date> = {
			ArrowLeft: () => addDays(day, -1),
			ArrowRight: () => addDays(day, 1),
			ArrowUp: () => addDays(day, -7),
			ArrowDown: () => addDays(day, 7),
			PageUp: () => new Date(day.getFullYear(), day.getMonth() - 1, day.getDate()),
			PageDown: () => new Date(day.getFullYear(), day.getMonth() + 1, day.getDate()),
			Home: () => addDays(day, -day.getDay()),
			End: () => addDays(day, 6 - day.getDay()),
		};
		const next = step[e.key];
		if (!next) return;
		e.preventDefault();
		moveFocus(next());
	};

	// The day that takes Tab focus: the focused one, else the selected one in view, else today or the 1st
	const tabDay =
		[focused, selected, today].find(
			(d) => d && d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear(),
		) ?? month;

	return (
		<div
			data-slot="calendar"
			className={cn('group/calendar w-fit bg-background p-3 [--cell-size:--spacing(8)]', className)}
		>
			<div className="relative flex flex-col gap-4 md:flex-row">
				<nav className="absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1">
					<button
						type="button"
						aria-label="Previous month"
						onClick={() => setMonth(addMonths(month, -1))}
						className={cn(buttonVariants({ variant: buttonVariant }), 'size-(--cell-size) select-none p-0')}
					>
						<ChevronLeftIcon className="size-4" />
					</button>
					<button
						type="button"
						aria-label="Next month"
						onClick={() => setMonth(addMonths(month, 1))}
						className={cn(buttonVariants({ variant: buttonVariant }), 'size-(--cell-size) select-none p-0')}
					>
						<ChevronRightIcon className="size-4" />
					</button>
				</nav>
				<div className="flex w-full flex-col gap-4">
					<div className="flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)">
						<span aria-live="polite" className="select-none font-medium text-sm">
							{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
						</span>
					</div>
					<table ref={grid} className="w-full border-collapse">
						<thead aria-hidden>
							<tr className="flex">
								{WEEKDAYS.map((day) => (
									<th
										key={day}
										scope="col"
										className="flex-1 select-none rounded-md font-normal text-[0.8rem] text-muted-foreground"
									>
										{day}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{weeks.map((week) => (
								<tr key={week[0].toDateString()} className="mt-2 flex w-full">
									{week.map((day) => {
										const outside = day.getMonth() !== month.getMonth();
										const isSelected = sameDay(day, selected);
										const isToday = sameDay(day, today);
										const isDisabled = disabled?.(day) ?? false;
										return (
											<td
												key={day.toDateString()}
												data-selected={isSelected || undefined}
												data-today={isToday || undefined}
												data-outside={outside || undefined}
												className={cn(
													'group/day relative aspect-square size-full select-none p-0 text-center',
													isToday && !isSelected && 'rounded-md bg-accent text-accent-foreground',
													outside && 'text-muted-foreground',
													isDisabled && 'text-muted-foreground opacity-50',
												)}
											>
												{(!outside || showOutsideDays) && (
													<CalendarDayButton
														day={day}
														selected={isSelected}
														disabled={isDisabled}
														tabIndex={sameDay(day, tabDay) ? 0 : -1}
														onClick={() => {
															setFocused(day);
															onSelect?.(isSelected ? undefined : day);
														}}
														onKeyDown={(e) => onKeyDown(e as unknown as KeyboardEvent, day)}
													/>
												)}
											</td>
										);
									})}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}

function CalendarDayButton({ day, selected, className, ...props }: ButtonProps & { day: Date; selected: boolean }) {
	return (
		<Button
			variant="ghost"
			size="icon"
			data-day={day.toDateString()}
			data-selected-single={selected}
			aria-label={day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
			aria-pressed={selected}
			className={cn(
				'flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 font-normal leading-none data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground dark:hover:text-accent-foreground [&>span]:text-xs [&>span]:opacity-70',
				className,
			)}
			{...props}
		>
			{day.getDate()}
		</Button>
	);
}

export { Calendar, CalendarDayButton };
