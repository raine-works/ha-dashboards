import { Delete, DoorClosed, Lock, type LucideIcon, Shield, Siren, TriangleAlert } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState } from 'preact/compat';
import { useHassSelector } from '../../context/HassContext';
import {
	ALARM_SYSTEM_WATCH,
	alarmSystemParts,
	DELETE_CHIME,
	describeProblem,
	KEY_CHIME,
	type SystemPart,
	type SystemPartKind,
	systemGroups,
	systemProblems,
} from '../../lib/security';
import { hapticTap, keepAudioAwake, playChime } from '../../lib/tones';
import { cn } from '../../lib/utils';
import {
	Alert,
	AlertDescription,
	AlertTitle,
	Badge,
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '../ui';

interface KeypadModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (code: string) => void;
	targetMode: string;
	/** Open doors/windows to warn about before arming (Alarmo refuses to arm over a monitored one). */
	openSensors?: string[];
}

// How long a touched key stays highlighted
const PRESS_FLASH_MS = 150;
// PIN dots always show at least this many, then grow with longer PINs (up to MAX_PIN_LENGTH)
const MIN_PIN_DOTS = 4;
const MAX_PIN_LENGTH = 6;

// The letters under each digit, as on a phone's keypad
const DIGITS: [string, string][] = [
	['1', ''],
	['2', 'ABC'],
	['3', 'DEF'],
	['4', 'GHI'],
	['5', 'JKL'],
	['6', 'MNO'],
	['7', 'PQRS'],
	['8', 'TUV'],
	['9', 'WXYZ'],
];

const MODE_TITLES: Record<string, string> = {
	disarmed: 'Disarm Alarm',
	armed_home: 'Arm Home',
	armed_away: 'Arm Away',
	armed_night: 'Arm Night',
};

const GROUPS: Record<SystemPartKind, { label: string; Icon: LucideIcon }> = {
	sensor: { label: 'Sensors', Icon: DoorClosed },
	lock: { label: 'Locks', Icon: Lock },
	siren: { label: 'Sirens', Icon: Siren },
};

const NO_PARTS: SystemPart[] = [];

/**
 * The arming check: everything labeled Alarm System (`alarmSystemParts()`), as a badge per kind
 * ("Locks 2/3", amber when one isn't working) and a warning naming what the alarm can't rely on.
 */
const SystemCheck: React.FC<{ parts: SystemPart[] }> = ({ parts }) => {
	const problems = systemProblems(parts);
	const them = problems.length === 1 ? 'it' : 'them';
	return (
		<>
			<div className="flex flex-wrap justify-center gap-2" role="status" aria-label="System check">
				{systemGroups(parts).map(({ kind, ready, total }) => {
					const { label, Icon } = GROUPS[kind];
					return (
						<Badge key={kind} variant={ready === total ? 'success' : 'warning'}>
							<Icon />
							{label}
							<span className="tabular-nums">
								{ready}/{total}
							</span>
						</Badge>
					);
				})}
			</div>
			{problems.length > 0 && (
				<Alert variant="warning">
					<TriangleAlert />
					{/* Whole, so a long name never cuts off what's wrong with it */}
					<AlertTitle className="line-clamp-none">
						{problems.length === 1 ? describeProblem(problems[0]) : `${problems.length} parts aren't working`}
					</AlertTitle>
					<AlertDescription>
						{problems.length > 1 && <p>{problems.map(describeProblem).join(', ')}</p>}
						{/* The 10.5" panels (960×600) keep the keys and Confirm on screen: the names, not the explanation */}
						<p className="short:hidden touch:max-lg:hidden">
							The alarm can't rely on {them}. Fix {them} first, or arm anyway.
						</p>
					</AlertDescription>
				</Alert>
			)}
		</>
	);
};

/**
 * The alarm's PIN pad, laid out like a phone's own: round keys with their letters, Cancel · 0 ·
 * delete under them and Confirm across the bottom; 64px keys, 80px on phones (where the dialog fills the
 * screen and the pad centers in it). A tapped key flashes solid, beeps (high for digits, low for
 * delete) and buzzes as the finger lands. A keyboard types too: digits, Backspace, Enter.
 */
export const KeypadModal: React.FC<KeypadModalProps> = ({
	isOpen,
	onClose,
	onSubmit,
	targetMode,
	openSensors = [],
}) => {
	const [pin, setPin] = useState('');
	const arming = isOpen && targetMode !== 'disarmed';
	// Checked while arming only (the pad stays mounted)
	const parts = useHassSelector((hass) => (arming && hass ? alarmSystemParts(hass, hass.states) : NO_PARTS), {
		watch: ALARM_SYSTEM_WATCH,
	});
	const hasProblems = systemProblems(parts).length > 0;
	const warned = hasProblems || (arming && openSensors.length > 0);
	// The key just touched, shown pressed briefly so every tap visibly registers (`n` restarts the
	// flash when the same key is pressed again)
	const [pressed, setPressed] = useState<{ key: string; n: number } | null>(null);

	useEffect(() => {
		if (!pressed) return;
		const timer = setTimeout(() => setPressed(null), PRESS_FLASH_MS);
		return () => clearTimeout(timer);
	}, [pressed]);

	// The audio starts as the pad opens (that tap is the gesture it needs) and stays awake while it's
	// open, so the first key sounds and none come late
	useEffect(() => {
		if (!isOpen) return;
		return keepAudioAwake(KEY_CHIME, DELETE_CHIME);
	}, [isOpen]);

	const pressFeedback = (key: string) => {
		setPressed((prev) => ({ key, n: (prev?.n ?? 0) + 1 }));
		playChime(/^\d$/.test(key) ? KEY_CHIME : DELETE_CHIME);
		hapticTap();
	};

	const handleDigit = (digit: string) => setPin((prev) => (prev.length < MAX_PIN_LENGTH ? prev + digit : prev));
	const handleBackspace = () => setPin((prev) => prev.slice(0, -1));

	const handleConfirm = () => {
		if (pin.length > 0) {
			onSubmit(pin);
			setPin('');
			onClose();
		}
	};

	const handleCancel = () => {
		setPin('');
		onClose();
	};

	// A keyboard (a laptop, a tablet's): digits, Backspace, Enter
	useEffect(() => {
		if (!isOpen) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			// Enter on a focused button (Cancel) is that button's
			// (the event's own target: a page-level listener sees only the card's host as the target)
			const target = e.composedPath()[0] as HTMLElement | undefined;
			if (e.key === 'Enter' && target?.closest?.('button')) return;
			if (/^\d$/.test(e.key)) {
				pressFeedback(e.key);
				handleDigit(e.key);
			} else if (e.key === 'Backspace') {
				pressFeedback('delete');
				handleBackspace();
			} else if (e.key === 'Enter') handleConfirm();
			else return;
			e.preventDefault();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [isOpen, pin]);

	const key = (id: string, label: React.ReactNode, onPress: () => void, ariaLabel?: string, ghost = false) => (
		<Button
			key={id}
			// Solid while pressed: a touchscreen has no hover state to show the tap
			variant={pressed?.key === id ? 'default' : ghost ? 'ghost' : 'secondary'}
			size="pad"
			onPointerDown={() => pressFeedback(id)}
			// Buzzes as the finger lands (pressFeedback), not again on the page-wide click
			data-haptic="off"
			onClick={onPress}
			aria-label={ariaLabel}
			className={cn('transition-transform', pressed?.key === id && 'scale-95')}
		>
			{label}
		</Button>
	);

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
			{/* A phone: laid out like its own PIN screen, the title, dots and keys (as big as the screen
			    allows) from the top, Confirm on the bottom edge, instead of a small block in the middle */}
			<DialogContent
				size="compact"
				className={cn('short:gap-2 short:p-4 max-sm:gap-6', warned && 'touch:max-lg:gap-3')}
			>
				<DialogHeader className="items-center text-center max-sm:mt-[6svh] sm:px-10 sm:text-center">
					{/* A phone on its side: the keys get the height */}
					<Shield className="short:hidden size-8 text-muted-foreground sm:max-lg:hidden" />
					<DialogTitle>{MODE_TITLES[targetMode] ?? 'Security PIN'}</DialogTitle>
					{/* A warning takes its room on the 10.5" panels, so Confirm stays on screen */}
					<DialogDescription className={cn('short:hidden', warned && 'touch:max-lg:hidden')}>
						Enter master PIN to confirm
					</DialogDescription>
				</DialogHeader>

				{arming && <SystemCheck parts={parts} />}

				{openSensors.length > 0 && (
					<Alert variant="warning">
						<TriangleAlert />
						<AlertTitle>
							{openSensors.length === 1 ? `${openSensors[0]} is open` : `${openSensors.length} doors or windows open`}
						</AlertTitle>
						<AlertDescription>
							{openSensors.length > 1 && <p>{openSensors.join(', ')}</p>}
							<p className="touch:max-lg:hidden">The alarm won't arm while a monitored door or window is open.</p>
						</AlertDescription>
					</Alert>
				)}

				{/* PIN dots: hollow until a digit fills them */}
				<div className="flex h-5 items-center justify-center gap-4" role="status">
					<span className="sr-only">{`${pin.length} digits entered`}</span>
					{Array.from({ length: Math.max(MIN_PIN_DOTS, pin.length) }, (_, idx) => (
						<div
							key={idx}
							data-filled={pin.length > idx ? '' : undefined}
							className="size-3.5 rounded-full border-2 border-muted-foreground/50 transition-all data-filled:scale-110 data-filled:border-primary data-filled:bg-primary"
						/>
					))}
				</div>

				{/* The keys: 1–9, then Cancel · 0 · delete */}
				<div className="grid grid-cols-3 justify-items-center gap-x-6 gap-y-3 short:gap-y-2 max-sm:gap-x-8 max-sm:gap-y-[2.5svh]">
					{DIGITS.map(([digit, letters]) =>
						key(
							digit,
							<>
								<span>{digit}</span>
								{/* Every key keeps the letters' line, so the digits line up */}
								<span className="short:hidden h-3 font-medium text-[0.625rem] text-muted-foreground tracking-[0.2em]">
									{letters}
								</span>
							</>,
							() => handleDigit(digit),
						),
					)}
					{key('cancel', <span className="text-base">Cancel</span>, handleCancel, 'Cancel', true)}
					{key('0', <span>0</span>, () => handleDigit('0'))}
					{key('delete', <Delete className="size-7" />, handleBackspace, 'Delete', true)}
				</div>

				{/* Something the alarm relies on isn't working: arming is still the person's call */}
				<Button
					size="xl"
					variant={hasProblems ? 'warning' : 'default'}
					onClick={handleConfirm}
					disabled={pin.length === 0}
					className="short:h-11 w-full max-sm:mt-auto"
				>
					{hasProblems ? <TriangleAlert /> : <Lock />}
					{hasProblems ? 'Arm anyway' : 'Confirm'}
				</Button>
			</DialogContent>
		</Dialog>
	);
};
