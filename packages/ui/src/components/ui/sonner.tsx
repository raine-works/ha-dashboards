/**
 * shadcn/ui's Sonner (new-york v4), in the dashboard's light/dark mode (shadcn reads it from
 * next-themes); sonner's CSS is imported by theme.css because its automatic `<head>` injection
 * doesn't reach a ShadowRoot.
 *
 * @module
 */

import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react';
import type React from 'preact/compat';
import { type ExternalToast, Toaster as Sonner, toast as sonnerToast, type ToasterProps } from 'sonner';
import { useColorScheme } from '../../context/ColorScheme';
import { titleCase } from '../../lib/text';

// Rich colors style each toast type like the status Button variants: a faded tint of the status
// color with a solid status-color border and status-colored text. success = green, info = blue
// (events), warning = amber, error = red (alarm). The tint is mixed into the popover color rather
// than made transparent, so content behind a toast never shows through.
const tint = (token: string) => `color-mix(in oklab, var(--${token}) 18%, var(--popover))`;
// Lift the status color toward the foreground so text stays legible on its own tint
const ink = (token: string) => `color-mix(in oklab, var(--${token}) 75%, var(--foreground))`;

/** Where toasts show: one per card, in the status colors. */
const Toaster = ({ ...props }: ToasterProps) => {
	const theme = useColorScheme();
	return (
		<Sonner
			theme={theme}
			richColors
			className="toaster group"
			icons={{
				success: <CircleCheckIcon className="size-5" />,
				info: <InfoIcon className="size-5" />,
				warning: <TriangleAlertIcon className="size-5" />,
				error: <OctagonXIcon className="size-5" />,
				loading: <Loader2Icon className="size-5 animate-spin" />,
			}}
			toastOptions={{
				classNames: {
					toast: 'gap-3! px-5! py-4! shadow-lg!',
					title: 'text-base! font-semibold!',
					description: 'text-sm! opacity-90',
					actionButton:
						'h-9! px-4! text-sm! font-semibold! rounded-md! border! border-current! bg-current/15! text-current!',
				},
			}}
			style={
				{
					'--width': '420px',
					'--normal-bg': 'var(--popover)',
					'--normal-text': 'var(--popover-foreground)',
					'--normal-border': 'var(--border)',
					'--border-radius': 'var(--radius)',
					'--success-bg': tint('success'),
					'--success-border': 'var(--success)',
					'--success-text': ink('success'),
					'--info-bg': tint('info'),
					'--info-border': 'var(--info)',
					'--info-text': ink('info'),
					'--warning-bg': tint('warning'),
					'--warning-border': 'var(--warning)',
					'--warning-text': ink('warning'),
					'--error-bg': tint('alarm'),
					'--error-border': 'var(--alarm)',
					'--error-text': ink('alarm'),
				} as React.CSSProperties
			}
			{...props}
		/>
	);
};

// Every toast's title in title case ("Front Door Opened"), whoever writes it
const titled = <T,>(message: T): T => (typeof message === 'string' ? (titleCase(message) as T) : message);
/** sonner's `toast` (and `toast.success`, `.error`…), titles in Title Case. */
const toast: typeof sonnerToast = Object.assign(
	(message: Parameters<typeof sonnerToast>[0], data?: ExternalToast) => sonnerToast(titled(message), data),
	sonnerToast,
	Object.fromEntries(
		(['success', 'info', 'warning', 'error', 'message', 'loading'] as const).map((type) => [
			type,
			(message: Parameters<typeof sonnerToast>[0], data?: ExternalToast) => sonnerToast[type](titled(message), data),
		]),
	),
);

export { Toaster, toast };
