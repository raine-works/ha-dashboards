import {
	Blinds,
	ChevronRight,
	Clock,
	Fan,
	House,
	Lightbulb,
	Lock,
	type LucideIcon,
	Moon,
	Speaker,
	Tablet,
	Thermometer,
	TriangleAlert,
	Tv,
} from 'lucide-react';
import type React from 'preact/compat';
import { useState } from 'preact/compat';
import { useHassSelector } from '../../context/HassContext';
import { useHouseConfig } from '../../context/HouseConfig';
import {
	BEDTIME_DOMAINS,
	type BedtimeStepKind,
	bedtimeRooms,
	HOME_ROUTINE,
	isHomeBedtime,
	type OtherBedtimeRoom,
	otherBedtimeRooms,
} from '../../lib/bedtime';
import { nameList } from '../../lib/text';
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	SwitchRow,
} from '../ui';

const STEP_ICONS: Record<BedtimeStepKind, LucideIcon> = {
	rooms: Moon,
	lights: Lightbulb,
	media: Tv,
	speaker: Speaker,
	fan: Fan,
	covers: Blinds,
	locks: Lock,
	climate: Thermometer,
	alert: TriangleAlert,
	panels: Tablet,
};

/** "In bedtime", "Sam is home", "Alex is away", "Nobody's assigned": what a room in the list is up to. */
function roomStatus(room: OtherBedtimeRoom): string {
	if (room.on) return room.home.length > 0 ? `In bedtime · ${nameList(room.home)} home` : 'In bedtime';
	if (room.home.length > 0) return `${nameList(room.home)} ${room.home.length === 1 ? 'is' : 'are'} home`;
	if (room.away.length > 0) return `${nameList(room.away)} ${room.away.length === 1 ? 'is' : 'are'} away`;
	return "Nobody's assigned";
}

export interface BedtimeDialogProps {
	/** The bedtime toggle about to turn on: Home Bedtime or a room's. */
	entityId: string;
	/** Its room's name ("Sam's Room"), when the routine has no zone of its own. */
	name: string;
	open: boolean;
	onCancel: () => void;
	/** Starts this bedtime, plus the other rooms picked (`extra`: their toggles). */
	onConfirm: (extra: string[]) => void;
	/**
	 * The signed-in member's own toggle: its dialog also offers the rooms whose people are all away
	 * (`awayBedtimeRooms()`), and the whole house instead, a second step with Home Bedtime's own
	 * confirmation, as on the wall panels, which calls this.
	 */
	onConfirmHouse?: () => void;
}

/**
 * Before a bedtime toggle turns on: the zone it's for and what its routine will do (the house
 * settings' `bedtime_routines` / `HOME_ROUTINE` in lib/bedtime.ts, kept in step with the automations by a test).
 */
export const BedtimeDialog: React.FC<BedtimeDialogProps> = ({
	entityId,
	name,
	open,
	onCancel,
	onConfirm,
	onConfirmHouse,
}) => {
	// The room's step, or the whole house's after "Put the whole house to bed"
	const [house, setHouse] = useState(false);
	const home = house || isHomeBedtime(entityId);
	const { bedtimeRoutines } = useHouseConfig();
	const routine = home ? HOME_ROUTINE : bedtimeRoutines[entityId];
	const member = !!onConfirmHouse;
	// Every other room: those nobody's home in can be put to bed with this one (asked, so off until
	// picked); the others show whether their people have started theirs
	const others = useHassSelector((hass) => (hass && member && !home ? otherBedtimeRooms(hass) : []), {
		watch: (id) => id.startsWith('person.') || id.startsWith('input_boolean.') || id.startsWith('switch.'),
	});
	const [picked, setPicked] = useState<string[]>([]);
	const pick = (id: string, on: boolean) => setPicked((prev) => (on ? [...prev, id] : prev.filter((p) => p !== id)));
	const extra = picked.filter((id) => others.some((room) => room.entityId === id && room.pickable));
	// Every room in bedtime once this starts: Home Bedtime follows (the integration keeps them in step)
	const startsHome = useHassSelector(
		(hass) =>
			hass && !home
				? bedtimeRooms(hass).every(
						(room) =>
							room.entityId === entityId || extra.includes(room.entityId) || hass.states[room.entityId]?.state === 'on',
					)
				: false,
		{ watch: BEDTIME_DOMAINS },
	);
	// Home Bedtime names the rooms still awake, which it puts to bed with their own routines
	const awake = useHassSelector(
		(hass) => (hass && home ? bedtimeRooms(hass).filter((room) => hass.states[room.entityId]?.state !== 'on') : []),
		{ watch: BEDTIME_DOMAINS },
	).map((room) => room.name);
	const steps = (routine?.steps ?? []).flatMap((step) => {
		if (step.kind !== 'rooms') return [step];
		return awake.length > 0 ? [{ ...step, text: `Puts ${nameList(awake)} to bed, each with its own routine` }] : [];
	});
	const zone = routine?.zone ?? name;
	const notes: { icon: LucideIcon; text: string }[] = [
		{
			icon: Clock,
			text: home
				? "Ends when any room's bedtime turns off, or at 9 AM. Turning it off doesn't undo anything."
				: "Ends when you turn it off, or at 9 AM. Turning it off doesn't undo anything.",
		},
		...(home ? [] : [{ icon: Lightbulb, text: `Turning on a light in ${name} asks first while it's on.` }]),
		...(startsHome
			? [{ icon: House, text: 'That puts every room to bed, so Home Bedtime starts too: locks, thermostat and all.' }]
			: []),
	];
	return (
		<Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
			<DialogContent className="gap-5 sm:max-w-md">
				<DialogHeader className="flex-row items-center gap-3 text-left max-sm:pl-0">
					{/* Night's own color, a small hint like a section icon */}
					<span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-500 dark:bg-indigo-400/15 dark:text-indigo-400">
						{home ? <House className="size-5" /> : <Moon className="size-5" />}
					</span>
					<div className="flex min-w-0 flex-col gap-0.5">
						<DialogTitle>{home ? 'Home Bedtime' : `${name} Bedtime`}</DialogTitle>
						<DialogDescription>{home ? 'The whole house' : zone}</DialogDescription>
					</div>
				</DialogHeader>

				<div className="flex flex-col gap-2">
					<h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">When it turns on</h3>
					{steps.length > 0 ? (
						<ul className="flex flex-col divide-y rounded-lg border">
							{steps.map(({ kind, text }) => {
								const Icon = STEP_ICONS[kind];
								return (
									<li key={text} className="flex items-center gap-3 px-3 py-2.5 text-sm">
										<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
											<Icon className="size-4" />
										</span>
										<span>{text}</span>
									</li>
								);
							})}
						</ul>
					) : (
						<p className="text-muted-foreground text-sm">Runs its bedtime routine.</p>
					)}
				</div>

				{others.length > 0 && (
					<div className="flex flex-col gap-2">
						<h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Other rooms</h3>
						<div className="flex flex-col divide-y overflow-hidden rounded-lg border">
							{others.map((room) => (
								<SwitchRow
									key={room.entityId}
									// On already, or picked; someone home there starts their own
									checked={room.on || extra.includes(room.entityId)}
									disabled={!room.pickable}
									onCheckedChange={(on) => pick(room.entityId, on)}
									aria-label={`Also start ${room.name} bedtime`}
									className="px-3 py-2.5"
								>
									<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
										<Moon className="size-4" />
									</span>
									<span className="flex min-w-0 flex-1 flex-col">
										<span className="truncate font-medium text-sm">{room.name}</span>
										<span className="truncate text-muted-foreground text-xs">{roomStatus(room)}</span>
									</span>
								</SwitchRow>
							))}
						</div>
					</div>
				)}

				{/* The notes, the whole house and the buttons go together: on a phone's full-screen dialog, at the bottom edge */}
				<ul className="flex flex-col gap-1.5 max-sm:mt-auto">
					{notes.map(({ icon: Icon, text }) => (
						<li key={text} className="flex items-start gap-2 text-muted-foreground text-xs">
							<Icon className="mt-px size-3.5 shrink-0" />
							<span>{text}</span>
						</li>
					))}
				</ul>

				{/* The member's own room: the whole house instead, its own confirmation next */}
				{!home && onConfirmHouse && (
					<Button
						variant="outline"
						size="xl"
						onClick={() => setHouse(true)}
						className="h-auto w-full justify-start gap-3 py-3 text-left"
					>
						<House className="size-5" />
						<span className="flex min-w-0 flex-1 flex-col">
							<span>Whole house instead</span>
							<span className="truncate font-normal text-muted-foreground text-xs">
								Every room, the lights, locks and thermostats
							</span>
						</span>
						<ChevronRight className="size-5 text-muted-foreground" />
					</Button>
				)}

				{/* Equal widths when there's room; a longer label takes what it needs, never losing its padding */}
				<DialogFooter className="flex-row max-sm:mt-0">
					{/* From a room's dialog, Back returns to it; Home Bedtime's own dialog just cancels */}
					<Button variant="outline" size="xl" onClick={house ? () => setHouse(false) : onCancel} className="flex-1">
						{house ? 'Back' : 'Cancel'}
					</Button>
					<Button size="xl" onClick={house ? onConfirmHouse : () => onConfirm(extra)} className="flex-1">
						<Moon />
						{home ? 'Start Home Bedtime' : 'Start Bedtime'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
