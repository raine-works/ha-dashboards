import { Printer as PrinterIcon } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState } from 'preact/compat';
import { useHassApi, useHassSelector } from '../../context/HassContext';
import { useWallPanelName } from '../../context/WallPanel';
import { withHolidayCategory } from '../../lib/holidayMessages';
import { houseAction } from '../../lib/household';
import { phoneMessageSender } from '../../lib/intercom';
import { householdFirstName, PEOPLE_WATCH } from '../../lib/people';
import { NOTE_MAX, NOTE_PRESETS } from '../../lib/printer';
import { cn } from '../../lib/utils';
import { useHoliday } from '../holiday/useHoliday';
import type { PrinterView } from '../printer/usePrinter';
import { Alert, AlertDescription, Button, Input } from '../ui';
import { PresetPicker } from './PresetPicker';

// Close to the limit: the counter turns amber
const NEAR_LIMIT = NOTE_MAX - 20;

/**
 * The Messages dialog's Notes tab: a little note printed on the receipt printer, quick or typed,
 * signed by whoever sent it (the integration's `print_note`, else the house's script: the signed-in person, else the wall panel).
 * Lists print from the To-do dialog.
 */
export const PrintNotes: React.FC<{ printer: PrinterView }> = ({ printer }) => {
	const { callService, getHass } = useHassApi();
	const wallPanel = useWallPanelName();
	const firstName = useHassSelector((hass) => (hass ? householdFirstName(hass.states, hass.user?.id) : undefined), {
		watch: PEOPLE_WATCH,
	});
	// In a holiday's days its quick notes come first (and open)
	const holiday = useHoliday()?.holiday.id;
	const [message, setMessage] = useState('');
	// The quick note printing, one at a time; typed notes never wait
	const [printing, setPrinting] = useState<string | null>(null);
	const [result, setResult] = useState<{ text: string; isError?: boolean } | null>(null);

	// A confirmation clears after a moment; an error stays until the next try
	useEffect(() => {
		if (!result || result.isError) return;
		const timer = setTimeout(() => setResult(null), 3000);
		return () => clearTimeout(timer);
	}, [result]);

	const { blockedReason, problem } = printer;
	const sender = phoneMessageSender(firstName, wallPanel);

	// A promise chain, not try/finally: the React Compiler can't take a finally clause
	const printNote = (text: string, typed = false) => {
		const trimmed = text.trim().slice(0, NOTE_MAX);
		if (!trimmed || blockedReason || (!typed && printing)) return;
		setResult(null);
		// A typed note leaves its box at once and the next can follow
		if (typed) setMessage('');
		else setPrinting(trimmed);
		callService(
			...houseAction(getHass() ?? {}, 'print_note'),
			{ message: trimmed, sender: sender ?? '', printer: printer.printer.entityId },
			{ errors: 'throw' },
		)
			.then(() => setResult({ text: `Printed on the ${printer.printer.name}` }))
			.catch(() => {
				setResult({ text: "Couldn't print the note", isError: true });
				// Put a failed note back to try again, unless something new was typed meanwhile
				if (typed) setMessage((current) => current || trimmed);
			})
			.then(() => {
				if (!typed) setPrinting(null);
			});
	};

	const typed = message.trim();
	const left = NOTE_MAX - message.length;

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 short:gap-3 overflow-y-auto overflow-x-hidden p-1">
			{problem && (
				<Alert variant={blockedReason ? 'destructive' : 'warning'} className="shrink-0">
					<PrinterIcon />
					<AlertDescription>{problem}</AlertDescription>
				</Alert>
			)}

			{/* Fills the spare height so the note box sits at the bottom edge, its chips scrolling inside it */}
			<PresetPicker
				title="Quick notes"
				categories={withHolidayCategory(NOTE_PRESETS, holiday, (m) => m.notes)}
				storageKey="panel-ui:intercom-note-category"
			>
				{(preset) => (
					<Button
						key={preset}
						variant="outline"
						size="lg"
						onClick={() => printNote(preset)}
						loading={printing === preset}
						disabled={!!blockedReason || (printing !== null && printing !== preset)}
						title={blockedReason ?? preset}
					>
						{preset}
					</Button>
				)}
			</PresetPicker>

			<form
				className="flex flex-col gap-1.5 max-md:mt-auto"
				onSubmit={(e) => {
					e.preventDefault();
					printNote(message, true);
				}}
			>
				<div className="flex gap-2">
					<div className="relative min-w-0 flex-1">
						<Input
							value={message}
							maxLength={NOTE_MAX}
							onInput={(e) => setMessage((e.target as HTMLInputElement).value.slice(0, NOTE_MAX))}
							placeholder="Type a note to print…"
							aria-label="Note to print"
							aria-describedby="print-note-count"
							// The keyboard resizes the panel after focus; bring the box back into view once it has
							onFocus={(e) => {
								const input = e.currentTarget;
								setTimeout(() => input.scrollIntoView({ block: 'nearest' }), 350);
							}}
							className="h-12 pr-14 text-base md:text-base"
						/>
						<span
							id="print-note-count"
							className={cn(
								'pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-muted-foreground text-xs tabular-nums',
								message.length > NEAR_LIMIT && 'text-warning',
							)}
						>
							{left}
							<span className="sr-only"> characters left</span>
						</span>
					</div>
					<Button type="submit" size="xl" disabled={!!blockedReason || !typed} title={blockedReason}>
						<PrinterIcon />
						Print
					</Button>
				</div>
				{/* The last result, on a line that's always there, so a result coming and going never moves the box */}
				<p
					role="status"
					className={cn('h-5 truncate text-sm', result?.isError ? 'text-destructive' : 'text-muted-foreground')}
				>
					{result?.text}
				</p>
			</form>
		</div>
	);
};
