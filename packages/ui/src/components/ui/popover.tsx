import React, {
	cloneElement,
	createPortal,
	isValidElement,
	useContext,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'preact/compat';
import { cn } from '../../lib/utils';
import { DialogPortalContainer } from './dialog';

// shadcn/ui popover (new-york v4) without Radix: an anchored panel portaled to the panel's mount
// point (so it escapes scrolling dialogs), positioned below its trigger (above when there's no
// room), kept on screen, and closed by Escape or a tap outside.

interface PopoverContextValue {
	open: boolean;
	setOpen: (open: boolean) => void;
	anchor: React.MutableRefObject<HTMLElement | null>;
}

const PopoverContext = React.createContext<PopoverContextValue | null>(null);

const usePopover = () => {
	const context = useContext(PopoverContext);
	if (!context) throw new Error('Popover parts must be used inside <Popover>');
	return context;
};

export interface PopoverProps {
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	children: React.ReactNode;
}

function Popover({ open: controlled, defaultOpen = false, onOpenChange, children }: PopoverProps) {
	const [uncontrolled, setUncontrolled] = useState(defaultOpen);
	const open = controlled ?? uncontrolled;
	const anchor = useRef<HTMLElement | null>(null);
	const setOpen = (next: boolean) => {
		if (controlled === undefined) setUncontrolled(next);
		onOpenChange?.(next);
	};
	return <PopoverContext.Provider value={{ open, setOpen, anchor }}>{children}</PopoverContext.Provider>;
}

export interface PopoverTriggerProps extends React.HTMLAttributes<HTMLButtonElement> {
	/** Use the single child (e.g. a Button) as the trigger instead of a plain button. */
	asChild?: boolean;
}

// What the popover sits by (outside the components: the React Compiler doesn't know the context's
// ref for one and won't compile a component that writes it)
function setAnchor(anchor: { current: HTMLElement | null }, el: HTMLElement | null) {
	anchor.current = el;
}

function PopoverTrigger({ asChild, children, onClick, ...props }: PopoverTriggerProps) {
	const { open, setOpen, anchor } = usePopover();
	const child =
		asChild && isValidElement(children)
			? (children as React.ReactElement<{ onClick?: (e: MouseEvent) => void }>)
			: null;
	const triggerProps = {
		'data-slot': 'popover-trigger',
		'data-state': open ? 'open' : 'closed',
		'aria-haspopup': 'dialog' as const,
		'aria-expanded': open,
		ref: (el: HTMLElement | null) => setAnchor(anchor, el),
		onClick: (e: MouseEvent) => {
			(onClick as ((e: MouseEvent) => void) | undefined)?.(e);
			child?.props.onClick?.(e);
			setOpen(!open);
		},
	};
	if (child) return cloneElement(child, { ...props, ...triggerProps });
	return (
		<button type="button" {...props} {...triggerProps}>
			{children}
		</button>
	);
}

// Room kept between the popover and the screen's edges (and Home Assistant's toolbar)
// What can take focus inside a popover
const FOCUSABLE =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const EDGE = 8;

export interface PopoverContentProps extends React.HTMLAttributes<HTMLDivElement> {
	align?: 'start' | 'center' | 'end';
	sideOffset?: number;
}

function PopoverContent({ className, align = 'center', sideOffset = 4, style, ...props }: PopoverContentProps) {
	const { open, setOpen, anchor } = usePopover();
	const container = useContext(DialogPortalContainer);
	const content = useRef<HTMLDivElement>(null);
	const [position, setPosition] = useState<{ top: number; left: number; side: 'top' | 'bottom' } | null>(null);

	// Place it against the trigger: below when it fits, else above (else wherever there's more room)
	useLayoutEffect(() => {
		if (!open) {
			setPosition(null);
			return;
		}
		const place = () => {
			const trigger = anchor.current?.getBoundingClientRect();
			const panel = content.current;
			if (!trigger || !panel) return;
			const { width, height } = panel.getBoundingClientRect();
			const host = panel.getRootNode() as ShadowRoot | Document;
			const hostEl = 'host' in host ? (host.host as HTMLElement) : document.documentElement;
			const top = Number.parseFloat(getComputedStyle(hostEl).getPropertyValue('--panel-top')) || 0;
			const below = window.innerHeight - trigger.bottom - sideOffset - EDGE;
			const above = trigger.top - sideOffset - EDGE - top;
			const side = below >= height || below >= above ? 'bottom' : 'top';
			let y = side === 'bottom' ? trigger.bottom + sideOffset : trigger.top - sideOffset - height;
			y = Math.max(top + EDGE, Math.min(y, window.innerHeight - EDGE - height));
			let x =
				align === 'start'
					? trigger.left
					: align === 'end'
						? trigger.right - width
						: trigger.left + trigger.width / 2 - width / 2;
			x = Math.max(EDGE, Math.min(x, window.innerWidth - EDGE - width));
			setPosition({ top: Math.round(y), left: Math.round(x), side });
		};
		place();
		const observer = new ResizeObserver(place);
		if (content.current) observer.observe(content.current);
		window.addEventListener('resize', place);
		window.addEventListener('scroll', place, true);
		return () => {
			observer.disconnect();
			window.removeEventListener('resize', place);
			window.removeEventListener('scroll', place, true);
		};
	}, [open, align, sideOffset]);

	// Panel extension: focus moves into the popover once it's placed (its first control; a tap shows no
	// ring, a keyboard does) and back to its trigger when it closes, unless something else took it (a
	// dialog a pick opened). Without it a popover in a dialog was out of the keyboard's reach.
	const placed = position !== null;
	useEffect(() => {
		if (!open || !placed) return;
		const panel = content.current;
		const root = panel?.getRootNode() as ShadowRoot | Document | undefined;
		if (panel && !panel.contains(root?.activeElement ?? null)) {
			(panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel).focus({ preventScroll: true });
		}
		return () => {
			const trigger = anchor.current;
			const active = (trigger?.getRootNode() as ShadowRoot | Document | undefined)?.activeElement;
			if (trigger && (!active || active === document.body)) trigger.focus({ preventScroll: true });
		};
	}, [open, placed]);

	// Escape closes the popover (not the dialog under it); a tap outside it and its trigger closes it
	useEffect(() => {
		if (!open) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			e.stopImmediatePropagation();
			setOpen(false);
		};
		const onPointerDown = (e: PointerEvent) => {
			const path = e.composedPath();
			if (content.current && path.includes(content.current)) return;
			if (anchor.current && path.includes(anchor.current)) return;
			setOpen(false);
		};
		window.addEventListener('keydown', onKeyDown, true);
		window.addEventListener('pointerdown', onPointerDown, true);
		return () => {
			window.removeEventListener('keydown', onKeyDown, true);
			window.removeEventListener('pointerdown', onPointerDown, true);
		};
	}, [open]);

	if (!open) return null;

	const panel = (
		<div
			ref={content}
			role="dialog"
			tabIndex={-1}
			// Tab stays inside the popover (it sits outside any dialog's own focus trap)
			onKeyDown={(e) => {
				if (e.key !== 'Tab') return;
				const items = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
					(el) => el.offsetParent !== null,
				);
				if (items.length === 0) return;
				const root = (e.currentTarget as HTMLElement).getRootNode() as ShadowRoot | Document;
				const first = items[0];
				const last = items[items.length - 1];
				if (e.shiftKey && root.activeElement === first) {
					e.preventDefault();
					last.focus();
				} else if (!e.shiftKey && root.activeElement === last) {
					e.preventDefault();
					first.focus();
				}
			}}
			data-slot="popover-content"
			data-state="open"
			data-side={position?.side ?? 'bottom'}
			data-align={align}
			className={cn(
				'z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden',
				className,
			)}
			// Measured first (hidden), then placed
			style={{
				position: 'fixed',
				top: position?.top ?? 0,
				left: position?.left ?? 0,
				visibility: position ? undefined : 'hidden',
				...(style as object),
			}}
			{...props}
		/>
	);
	return container ? createPortal(panel, container) : panel;
}

function PopoverAnchor({ children }: { children: React.ReactElement }) {
	const { anchor } = usePopover();
	return cloneElement(children, {
		ref: (el: HTMLElement | null) => setAnchor(anchor, el),
	});
}

function PopoverHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div data-slot="popover-header" className={cn('flex flex-col gap-1 text-sm', className)} {...props} />;
}

function PopoverTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div data-slot="popover-title" className={cn('font-medium', className)} {...props} />;
}

function PopoverDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
	return <p data-slot="popover-description" className={cn('text-muted-foreground', className)} {...props} />;
}

export { Popover, PopoverAnchor, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger };
