// Panel extension (not shadcn): a month of days to pick from that swipes to the months beside it.
// A native scroll-snap carousel of the previous, shown and next month (the platform's own momentum);
// once it settles on a neighbour, that month becomes the shown one and the carousel recenters on it
// unseen, so it swipes on forever. The arrows glide to a neighbour the same way.

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'preact/compat';
import { monthGrid } from '../../lib/calendar';
import { addMonths, dayKey, sameMonth } from '../../lib/picker';
import { hapticTap } from '../../lib/tones';
import { cn } from '../../lib/utils';
import { Button } from './button';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
/** Without scrollend, the carousel counts as settled this long after its last scroll. */
const SETTLE_MS = 120;

export interface MonthSwiperProps {
	/** The first of the month shown. */
	month: Date;
	onMonthChange: (month: Date) => void;
	/** The picked day, `YYYY-MM-DD`. */
	selected?: string;
	onSelect: (day: string) => void;
	className?: string;
}

const MonthGrid: React.FC<{ month: Date; selected?: string; today: string; onSelect: (day: string) => void }> = ({
	month,
	selected,
	today,
	onSelect,
}) => (
	<div className="grid w-full shrink-0 snap-center grid-cols-7 gap-y-1">
		{monthGrid(month).map((date) => {
			const day = dayKey(date);
			const inMonth = sameMonth(date, month);
			return (
				<button
					key={day}
					type="button"
					onClick={() => onSelect(day)}
					aria-pressed={day === selected}
					aria-label={date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
					className={cn(
						'mx-auto flex size-10 items-center justify-center rounded-full text-sm tabular-nums outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
						day === selected
							? 'bg-primary font-semibold text-primary-foreground'
							: cn('hover:bg-accent', inMonth ? 'text-foreground' : 'text-muted-foreground/50'),
						day === today && day !== selected && 'font-semibold text-primary ring-1 ring-primary/40',
					)}
				>
					{date.getDate()}
				</button>
			);
		})}
	</div>
);

// The middle slide, unseen (outside the component: the React Compiler won't compile one that
// changes an element it holds in state)
const centerSlide = (el: HTMLElement) => {
	el.scrollLeft = el.clientWidth;
};

export const MonthSwiper: React.FC<MonthSwiperProps> = ({ month, onMonthChange, selected, onSelect, className }) => {
	const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
	const shown = month.getFullYear() * 12 + month.getMonth();
	const today = dayKey(new Date());

	// Centered on the shown month: when it appears and after every change (unseen: the middle slide
	// now shows the month the finger left the carousel on)
	useEffect(() => {
		if (scroller) centerSlide(scroller);
	}, [scroller, shown]);

	// Settled on a neighbour: it becomes the shown month
	useEffect(() => {
		if (!scroller) return;
		const settle = () => {
			const slide = Math.round(scroller.scrollLeft / Math.max(1, scroller.clientWidth));
			if (slide === 1) return;
			hapticTap(6);
			onMonthChange(addMonths(month, slide === 0 ? -1 : 1));
		};
		if ('onscrollend' in window) {
			scroller.addEventListener('scrollend', settle);
			return () => scroller.removeEventListener('scrollend', settle);
		}
		let timer: ReturnType<typeof setTimeout> | undefined;
		const onScroll = () => {
			clearTimeout(timer);
			timer = setTimeout(settle, SETTLE_MS);
		};
		scroller.addEventListener('scroll', onScroll, { passive: true });
		return () => {
			clearTimeout(timer);
			scroller.removeEventListener('scroll', onScroll);
		};
	}, [scroller, shown]);

	const glide = (slide: 0 | 2) => scroller?.scrollTo({ left: slide * scroller.clientWidth, behavior: 'smooth' });

	return (
		<div data-slot="month-swiper" className={cn('flex w-70 flex-col gap-2', className)}>
			<div className="flex items-center justify-between">
				<Button variant="ghost" size="icon" onClick={() => glide(0)} aria-label="Previous month">
					<ChevronLeft />
				</Button>
				<span className="font-semibold text-sm" aria-live="polite">
					{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
				</span>
				<Button variant="ghost" size="icon" onClick={() => glide(2)} aria-label="Next month">
					<ChevronRight />
				</Button>
			</div>
			<div className="grid grid-cols-7 text-center font-medium text-muted-foreground text-xs">
				{WEEKDAYS.map((d, i) => (
					<span key={`${d}-${i}`}>{d}</span>
				))}
			</div>
			<div ref={setScroller} className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain">
				{[-1, 0, 1].map((offset) => {
					const m = addMonths(month, offset);
					return <MonthGrid key={m.getTime()} month={m} selected={selected} today={today} onSelect={onSelect} />;
				})}
			</div>
		</div>
	);
};
