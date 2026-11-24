/**
 * Panel extension: a row of chips that scrolls sideways.
 *
 * @module
 */

import React, { useEffect, useState } from 'preact/compat';
import { cn } from '../../lib/utils';

// How far the faded edge reaches into the row while more chips sit past it
const FADE = '1.5rem';

/**
 * Panel extension: a row of chips (quick messages, presets, speakers, people, effects) that scrolls
 * sideways instead of wrapping, each chip at its own width. It reaches 4px past its box (`-m-1 p-1`),
 * so focus rings and a busy chip's outline aren't clipped by the scroller. Its scrollbar is hidden,
 * so an edge with more chips past it fades out; a mouse wheel scrolls it sideways (a swipe and a
 * trackpad already do), and a chip that's tapped or focused half hidden scrolls into view.
 */
const ChipRow = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
	({ className, style, ...props }, ref) => {
		const [row, setRow] = useState<HTMLDivElement | null>(null);
		const [edges, setEdges] = useState({ start: false, end: false });

		useEffect(() => {
			if (!row) return;
			const update = () => {
				const start = row.scrollLeft > 1;
				const end = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
				setEdges((current) => (current.start === start && current.end === end ? current : { start, end }));
			};
			// A vertical wheel scrolls the row while it can move that way, then lets the page have it
			const wheel = (event: WheelEvent) => {
				if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || row.scrollWidth <= row.clientWidth) return;
				const before = row.scrollLeft;
				row.scrollLeft += event.deltaY;
				if (row.scrollLeft !== before) event.preventDefault();
			};
			const reveal = (event: Event) => {
				const chip = (event.target as Element | null)?.closest('[data-slot="chip-row"] > *');
				if (chip && chip.parentElement === row)
					chip.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
			};
			update();
			const resize = new ResizeObserver(update);
			resize.observe(row);
			// Chips come and go (speakers, people)
			const chips = new MutationObserver(update);
			chips.observe(row, { childList: true, subtree: true, characterData: true });
			row.addEventListener('scroll', update, { passive: true });
			row.addEventListener('wheel', wheel, { passive: false });
			row.addEventListener('focusin', reveal);
			row.addEventListener('click', reveal);
			return () => {
				resize.disconnect();
				chips.disconnect();
				row.removeEventListener('scroll', update);
				row.removeEventListener('wheel', wheel);
				row.removeEventListener('focusin', reveal);
				row.removeEventListener('click', reveal);
			};
		}, [row]);

		const setRef = (node: HTMLDivElement | null) => {
			setRow(node);
			if (typeof ref === 'function') ref(node);
			else if (ref) ref.current = node;
		};

		const mask =
			edges.start || edges.end
				? `linear-gradient(to right, ${edges.start ? 'transparent' : 'black'}, black ${FADE}, black calc(100% - ${FADE}), ${edges.end ? 'transparent' : 'black'})`
				: undefined;

		return (
			<div
				ref={setRef}
				data-slot="chip-row"
				className={cn(
					'scrollbar-none -m-1 flex min-w-0 items-center gap-2 overflow-x-auto overscroll-x-contain p-1 *:shrink-0',
					className,
				)}
				style={mask ? { ...(style as object), maskImage: mask, WebkitMaskImage: mask } : style}
				{...props}
			/>
		);
	},
);
ChipRow.displayName = 'ChipRow';

export { ChipRow };
