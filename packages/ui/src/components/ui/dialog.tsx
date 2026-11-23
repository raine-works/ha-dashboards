import { XIcon } from 'lucide-react';
import React, { createPortal, useEffect, useId, useLayoutEffect, useRef, useSyncExternalStore } from 'preact/compat';
import { cn } from '../../lib/utils';
import { ErrorBoundary } from '../layout/ErrorBoundary';
import { dialogHistory, dialogSlug } from './dialog-history';

/**
 * Element dialogs portal into. Panels mount inside a ShadowRoot, so this must be
 * an element within that root (not document.body) for the Tailwind styles to apply.
 * Portalling also escapes ancestors with backdrop-filter/transform, which would
 * otherwise become the containing block for `position: fixed`.
 */
export const DialogPortalContainer = React.createContext<HTMLElement | null>(null);

interface DialogContextValue {
	onOpenChange?: (open: boolean) => void;
	/** The title's id, for the content's aria-labelledby. */
	titleId?: string;
}

const DialogContext = React.createContext<DialogContextValue>({});

/** Close dialogs after this long without interaction, returning the panel to the dashboard. */
export const DEFAULT_DIALOG_IDLE_TIMEOUT_MS = 2 * 60 * 1000;

/** Fired on window by content that's in use without touch (a clip playing), to keep a dialog open. */
const DIALOG_ACTIVITY_EVENT = 'dialog-activity';
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', DIALOG_ACTIVITY_EVENT] as const;

/** Count as activity for open dialogs' idle timers (e.g. while a video plays). */
export const markDialogActivity = () => window.dispatchEvent(new Event(DIALOG_ACTIVITY_EVENT));

// Open dialogs, oldest first: Escape closes only the top one (a light's colors over the music,
// a doorbell's camera over anything)
const openDialogs: object[] = [];

// Open dialogs; the page stays locked until the last one closes (dialogs can stack)
let scrollLocks = 0;
let unlockPage: (() => void) | null = null;

// How many dialogs are open, for what should pause behind them (camera snapshots under a dialog)
let dialogsOpen = 0;
const dialogListeners = new Set<() => void>();

function countOpenDialog() {
	dialogsOpen++;
	for (const listener of dialogListeners) listener();
	return () => {
		dialogsOpen--;
		for (const listener of dialogListeners) listener();
	};
}

const subscribeDialogs = (listener: () => void) => {
	dialogListeners.add(listener);
	return () => {
		dialogListeners.delete(listener);
	};
};

/** How many dialogs are open (panel extension: work behind them can pause). */
export const useOpenDialogCount = () => useSyncExternalStore(subscribeDialogs, () => dialogsOpen);

// Hosts lifted out of their own layer, by how many open dialogs need it
const lifted = new Map<HTMLElement, number>();

/**
 * Let the dialog overlay cover Home Assistant's toolbar and sidebar too (blurring the whole screen):
 * the card's host is normally `isolation: isolate`, one layer under HA's chrome, so nothing of the
 * dashboard draws over the toolbar. While a dialog is open (counted, for stacked dialogs) the host
 * drops it; the last one to close puts it back.
 */
function liftAboveChrome(container: HTMLElement | null) {
	const root = container?.getRootNode();
	const host = root instanceof ShadowRoot ? (root.host as HTMLElement) : null;
	if (!host) return undefined;
	const count = lifted.get(host) ?? 0;
	if (count === 0) host.style.isolation = 'auto';
	lifted.set(host, count + 1);
	return () => {
		const left = (lifted.get(host) ?? 1) - 1;
		if (left > 0) lifted.set(host, left);
		else {
			lifted.delete(host);
			host.style.isolation = '';
		}
	};
}

/**
 * Stop the page behind dialogs from scrolling (and showing its scrollbar). The Home dashboard
 * scrolls the whole page, so without this the page moves and its scrollbar shows beside a
 * full-screen dialog. Pads by the scrollbar's width so the page doesn't shift when it hides.
 */
function lockPageScroll() {
	if (scrollLocks++ === 0) {
		const root = document.documentElement;
		const { overflow, paddingRight } = root.style;
		const scrollbar = window.innerWidth - root.clientWidth;
		root.style.overflow = 'hidden';
		if (scrollbar > 0) root.style.paddingRight = `${scrollbar}px`;
		unlockPage = () => {
			root.style.overflow = overflow;
			root.style.paddingRight = paddingRight;
		};
	}
	return () => {
		if (--scrollLocks === 0) {
			unlockPage?.();
			unlockPage = null;
		}
	};
}

export interface DialogProps {
	open: boolean;
	onOpenChange?: (open: boolean) => void;
	/** Auto-close after this many ms without interaction; 0 disables. Requires onOpenChange. */
	idleTimeoutMs?: number;
	/**
	 * A browser history entry while open, so Back closes it (`dialog-history.ts`; the default).
	 * Requires onOpenChange.
	 */
	history?: boolean;
	children: React.ReactNode;
}

/** The dialog's title as rendered (it portals into the panel's ShadowRoot). */
function titleText(container: HTMLElement | null, titleId: string) {
	const root = (container?.getRootNode() ?? document) as Document | ShadowRoot;
	return root.getElementById(titleId)?.textContent;
}

const Dialog: React.FC<DialogProps> = ({
	open,
	onOpenChange,
	idleTimeoutMs = DEFAULT_DIALOG_IDLE_TIMEOUT_MS,
	history = true,
	children,
}) => {
	const container = React.useContext(DialogPortalContainer);
	// Callers usually pass an inline callback; a ref keeps the listeners and idle timer from
	// resetting on every parent render (e.g. each Home Assistant state update)
	const onOpenChangeRef = useRef(onOpenChange);
	// Kept current after each render (never written during one, so the React Compiler compiles it)
	useLayoutEffect(() => {
		onOpenChangeRef.current = onOpenChange;
	});
	const canClose = !!onOpenChange;

	const titleId = useId();

	// Its place in the stack (Escape closes only the top one), for as long as it's open
	useEffect(() => {
		if (!open || !canClose) return;
		const token = {};
		openDialogs.push(token);
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && openDialogs[openDialogs.length - 1] === token) onOpenChangeRef.current?.(false);
		};
		window.addEventListener('keydown', onKeyDown);
		return () => {
			openDialogs.splice(openDialogs.indexOf(token), 1);
			window.removeEventListener('keydown', onKeyDown);
		};
	}, [open, canClose]);

	// Its own idle close, apart from the stack: a dialog whose timeout changes while open (party mode,
	// none while music plays) restarts only its timer, never moving above a dialog opened over it
	useEffect(() => {
		if (!open || !canClose || idleTimeoutMs <= 0) return;
		let idleTimer: ReturnType<typeof setTimeout> | undefined;
		const resetIdleTimer = () => {
			clearTimeout(idleTimer);
			idleTimer = setTimeout(() => onOpenChangeRef.current?.(false), idleTimeoutMs);
		};
		for (const type of ACTIVITY_EVENTS) window.addEventListener(type, resetIdleTimer, { passive: true });
		resetIdleTimer();
		return () => {
			clearTimeout(idleTimer);
			for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, resetIdleTimer);
		};
	}, [open, canClose, idleTimeoutMs]);

	// Its own history entry, so Back closes it; closed any other way, the entry goes too
	useEffect(() => {
		if (!open || !canClose || !history) return;
		return dialogHistory().open(
			() => dialogSlug(titleText(container, titleId)),
			() => onOpenChangeRef.current?.(false),
		);
	}, [open, canClose, history, container, titleId]);

	useEffect(() => (open ? lockPageScroll() : undefined), [open]);
	useEffect(() => (open ? countOpenDialog() : undefined), [open]);
	useEffect(() => (open ? liftAboveChrome(container) : undefined), [open, container]);

	if (!open) return null;

	const content = (
		<DialogContext.Provider value={{ onOpenChange, titleId }}>
			{/* The whole screen behind blurs, Home Assistant's toolbar included (panel extension;
			    liftAboveChrome), so it's clear a dialog is open; a stacked dialog blurs the one under it */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: Escape is handled on window above */}
			<div
				data-slot="dialog-overlay"
				className="fixed inset-0 z-50 bg-black/40 [-webkit-backdrop-filter:blur(6px)] [backdrop-filter:blur(6px)]"
				onClick={() => onOpenChange?.(false)}
			/>
			{/* A crash inside the dialog shows in a dialog that can still be closed, never blanking the panel */}
			<ErrorBoundary
				name="This dialog"
				variant="inline"
				frame={(fallback) => <DialogContent>{fallback}</DialogContent>}
			>
				{children}
			</ErrorBoundary>
		</DialogContext.Provider>
	);

	return container ? createPortal(content, container) : content;
};

const FOCUSABLE =
	'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Move focus into the dialog when it opens (unless something in it already took it, e.g. an
 * autofocused field) and back to what had it when it closes, so keyboard users stay in place.
 */
function useDialogFocus(ref: { current: HTMLElement | null }) {
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		// Inside the panel's ShadowRoot, document.activeElement is the host; the root knows the real one
		const root = el.getRootNode() as Document | ShadowRoot;
		const before = root.activeElement as HTMLElement | null;
		if (!el.contains(root.activeElement)) el.focus({ preventScroll: true });
		return () => {
			if (before?.isConnected) before.focus({ preventScroll: true });
		};
	}, []);
}

/** Keep Tab and Shift+Tab cycling inside the dialog (it's modal: the page behind isn't reachable). */
function trapTab(e: KeyboardEvent, el: HTMLElement | null) {
	if (e.key !== 'Tab' || !el) return;
	const focusable = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((f) => f.offsetParent !== null);
	if (focusable.length === 0) {
		e.preventDefault();
		return;
	}
	const root = el.getRootNode() as Document | ShadowRoot;
	const first = focusable[0];
	const last = focusable[focusable.length - 1];
	if (e.shiftKey && (root.activeElement === first || root.activeElement === el)) {
		e.preventDefault();
		last.focus();
	} else if (!e.shiftKey && root.activeElement === last) {
		e.preventDefault();
		first.focus();
	}
}

export interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
	showCloseButton?: boolean;
	/**
	 * Panel extension. `default`: shadcn's, sized to its content (confirmations, pickers, QR
	 * codes). `workspace`: every feature dialog (music, cameras, intercom, calendar, weather, energy,
	 * people, TVs, to-do, the brief, notifications, pets): 95% of the screen's width up to 100rem and
	 * 90% of its height, a flex column whose last row (its actions, a message box) sits on the bottom
	 * edge (`mt-auto`), the full screen on a phone like every dialog. `sheet`: `default` on wider
	 * screens, and on a phone a sheet from the bottom edge, as tall as its content up to the screen
	 * under the toolbar less 2rem (pickers such as the due date). `compact`: `default`, narrower on wider
	 * screens (24rem), for a phone-shaped column such as the alarm keypad. `fullscreen`: the whole screen
	 * under Home Assistant's toolbar (`--panel-top`, `--panel-height`), edge to edge without a border or
	 * rounded corners, a flex column (Party mode).
	 */
	size?: 'default' | 'workspace' | 'sheet' | 'compact' | 'fullscreen';
}

// The compact size: a narrow column on wider screens (phones take the whole screen like every dialog)
const COMPACT = 'sm:max-w-sm';

// The fullscreen size: the whole screen under Home Assistant's toolbar, edge to edge
const FULLSCREEN =
	'translate-none top-(--panel-top) left-0 flex h-(--panel-height) max-h-none w-screen max-w-none flex-col rounded-none border-0 sm:max-w-none';

// The sheet size's phone shape, applied after the phone's full-screen classes so it overrides their top and height
const SHEET =
	'max-sm:top-auto max-sm:max-h-[calc(var(--panel-height)-2rem)] max-sm:animate-sheet-in max-sm:rounded-t-2xl max-sm:border-t';

// The workspace size: one shape for every feature dialog, so none is narrower or shorter than the rest. The
// 10.5" wall panels (touch, below lg) take the screen's height less 1rem, room for their bigger controls
const WORKSPACE =
	'flex h-[calc(var(--panel-height)*0.9)] touch:max-lg:h-[calc(var(--panel-height)-1rem)] w-[95vw] max-w-400 flex-col sm:max-w-400 short:h-[calc(var(--panel-height)-1rem)] short:gap-2 short:p-4 max-md:h-[calc(var(--panel-height)-1rem)] max-md:max-w-[calc(100%-1rem)] max-md:gap-3 max-md:p-4';

// Panel extension: a filled 40px target (48px on the wall panels) instead of shadcn's faint 16px icon
const CLOSE_BUTTON =
	"flex size-10 touch:size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none [&_svg:not([class*='size-'])]:size-5 [&_svg]:pointer-events-none [&_svg]:shrink-0";

/**
 * Panel extension: the dialog's close button as part of a header's own row (the Daily dialog's,
 * beside its tabs), for a `DialogContent` with `showCloseButton={false}`: the same button, in the
 * flow, so it lines up with what's beside it and with the content's edge.
 */
const DialogClose: React.FC<{ className?: string }> = ({ className }) => {
	const { onOpenChange } = React.useContext(DialogContext);
	return (
		<button
			type="button"
			data-slot="dialog-close"
			onClick={() => onOpenChange?.(false)}
			className={cn(CLOSE_BUTTON, className)}
		>
			<XIcon />
			<span className="sr-only">Close</span>
		</button>
	);
};

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
	({ className, children, showCloseButton = true, size = 'default', onKeyDown, ...props }, ref) => {
		const { onOpenChange, titleId } = React.useContext(DialogContext);
		const localRef = useRef<HTMLDivElement | null>(null);
		const setRef = (el: HTMLDivElement | null) => {
			localRef.current = el;
			if (typeof ref === 'function') ref(el);
			else if (ref) ref.current = el;
		};
		useDialogFocus(localRef);
		// A dialog that lays itself out as a flex column sizes its own rows (a scroller that shrinks);
		// the others were grid rows, which never shrink, so on phones they keep their content height
		const ownLayout =
			size === 'workspace' || size === 'fullscreen' || /(?:^|\s)flex(?:\s|$)/.test(String(className ?? ''));

		return (
			<div
				ref={setRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				tabIndex={-1}
				onKeyDown={(e) => {
					trapTab(e, localRef.current);
					onKeyDown?.(e);
				}}
				data-slot="dialog-content"
				className={cn(
					'-translate-1/2 fixed top-[calc(50%+var(--panel-top)/2)] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] gap-4 rounded-lg border bg-background p-6 shadow-lg outline-none duration-200 sm:max-w-lg',
					// Panel extension: never taller than the screen under the toolbar (a phone on its side, an
					// on-screen keyboard), scrolling inside instead; dialogs with their own height or scroller override it
					'max-h-[calc(var(--panel-height)-2rem)] overflow-y-auto',
					// Panel extension: one column the dialog's own width (minmax(0, 1fr)): the implicit `auto` column grew to
					// its widest child's content, so a ChipRow's chips widened the dialog past its edge instead of scrolling
					'grid-cols-1',
					size === 'workspace' && WORKSPACE,
					size === 'compact' && COMPACT,
					size === 'fullscreen' && FULLSCREEN,
					// Panel extension: phones get the whole screen under Home Assistant's toolbar (clear of the notch and home indicator),
					// scrolling inside (never handing the scroll on to the page); listed last so it beats sizes the dialogs set for wider screens
					'max-sm:translate-none overscroll-contain max-sm:inset-x-0 max-sm:top-(--panel-top) max-sm:bottom-0 max-sm:h-auto max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:overflow-y-auto max-sm:rounded-none max-sm:border-0 max-sm:p-4 max-sm:pt-[max(--spacing(4),calc(env(safe-area-inset-top)-var(--panel-top)))] max-sm:pb-[max(--spacing(4),env(safe-area-inset-bottom))]',
					// Panel extension: full screen, a column, so the dialog feels whole: the footer (DialogFooter's mt-auto) and
					// any actions a dialog marks the same way sit at the bottom edge, not under the content with the screen empty below
					'max-sm:flex max-sm:flex-col',
					!ownLayout && 'max-sm:*:shrink-0',
					// The sheet size: on phones, let go of the top and rise from the bottom edge as tall as its content,
					// capped under the toolbar so a tall one scrolls inside instead of running up past it
					size === 'sheet' && SHEET,
					className,
				)}
				{...props}
			>
				{children}
				{showCloseButton && onOpenChange && (
					<button
						type="button"
						data-slot="dialog-close"
						onClick={() => onOpenChange(false)}
						className={cn(
							'absolute top-3 right-3 z-10 max-sm:top-[max(--spacing(3),calc(env(safe-area-inset-top)-var(--panel-top)))]',
							CLOSE_BUTTON,
						)}
					>
						<XIcon />
						<span className="sr-only">Close</span>
					</button>
				)}
			</div>
		);
	},
);
DialogContent.displayName = 'DialogContent';

const DialogHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
	({ className, ...props }, ref) => (
		<div
			ref={ref}
			data-slot="dialog-header"
			// pr-10 / px-10: clear of the close button (centered titles stay centered on phones)
			className={cn('flex flex-col gap-2 text-center max-sm:px-10 sm:pr-10 touch:sm:pr-12 sm:text-left', className)}
			{...props}
		/>
	),
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
	({ className, ...props }, ref) => (
		<div
			ref={ref}
			data-slot="dialog-footer"
			// mt-auto: on a phone's full-screen dialog the buttons sit at the bottom edge (panel extension)
			className={cn('flex flex-col-reverse gap-2 max-sm:mt-auto sm:flex-row sm:justify-end', className)}
			{...props}
		/>
	),
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
	({ className, ...props }, ref) => {
		const { titleId } = React.useContext(DialogContext);
		return (
			<h2
				ref={ref}
				id={titleId}
				data-slot="dialog-title"
				className={cn('font-semibold text-lg leading-none', className)}
				{...props}
			/>
		);
	},
);
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
	({ className, ...props }, ref) => (
		<p ref={ref} data-slot="dialog-description" className={cn('text-muted-foreground text-sm', className)} {...props} />
	),
);
DialogDescription.displayName = 'DialogDescription';

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle };
