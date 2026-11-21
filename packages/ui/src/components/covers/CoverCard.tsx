import {
	BatteryLow,
	BatteryMedium,
	Blinds,
	ChevronsDown,
	ChevronsLeftRight,
	ChevronsRightLeft,
	ChevronsUp,
	Square,
} from 'lucide-react';
import type React from 'preact/compat';
import { Fragment, useEffect, useState } from 'preact/compat';
import { useEntity, useHassApi, useHassSelector } from '../../context/HassContext';
import {
	batterySensorFor,
	batteryTone,
	COVERS_WATCH,
	type CoverMotion,
	discoverWindowCovers,
	estimatePosition,
	FULL_TRAVEL_MS,
	lowestBattery,
	type WindowCover,
} from '../../lib/covers';
import { pickStates } from '../../lib/hass-store';
import { cn } from '../../lib/utils';
import { isUnavailable } from '../../lib/values';
import type { HassEntity } from '../../types/homeassistant';
import { IconCurtains } from '../Icons';
import { Button, Card, CardAction, CardDescription, CardHeader, CardTitle, Separator, Slider } from '../ui';

// cover supported_features bits
const SUPPORT_SET_POSITION = 4;
const SUPPORT_STOP = 8;
// Stop showing "Opening..." if the cover never reports moving
const PENDING_TIMEOUT_MS = 15_000;
// How often a moving cover's estimated position updates
const MOTION_TICK_MS = 100;
// A reported move this long past a full travel is stalled (shown at rest)
const STALL_GRACE_MS = 4000;

export interface CoverView {
	status: 'open' | 'closed' | 'opening' | 'closing' | 'unavailable';
	label: string;
	/** 0 (closed) – 100 (open), when reported. */
	position: number | null;
	canSetPosition: boolean;
	canStop: boolean;
}

// At rest at or under this, a cover counts as closed (a curtain robot creeps to 1% after closing)
const CLOSED_AT_MOST = 1;

/**
 * What a curtain/blind card shows: state, position and supported controls. `pending` is a tap on its
 * way; `stalled` drops a move Home Assistant still reports long after it should have ended (the
 * curtain group says "opening" for a minute at a time while nothing moves).
 */
export function getCoverView(
	entity: HassEntity | undefined,
	pending?: 'opening' | 'closing',
	stalled = false,
): CoverView {
	const features = typeof entity?.attributes.supported_features === 'number' ? entity.attributes.supported_features : 0;
	const raw = entity?.attributes.current_position;
	const position = typeof raw === 'number' ? raw : null;
	const base = {
		position,
		canSetPosition: (features & SUPPORT_SET_POSITION) !== 0,
		canStop: (features & SUPPORT_STOP) !== 0,
	};

	const state = entity?.state;
	if (!entity || isUnavailable(state)) return { ...base, status: 'unavailable', label: 'Unavailable' };
	const reportedMove = !stalled && (state === 'opening' || state === 'closing') ? state : undefined;
	const moving = pending ?? reportedMove;
	if (moving) return { ...base, status: moving, label: moving === 'opening' ? 'Opening…' : 'Closing…' };
	const closed = position != null ? position <= CLOSED_AT_MOST : state === 'closed' || state === 'closing';
	if (closed) return { ...base, status: 'closed', label: 'Closed' };
	return { ...base, status: 'open', label: position != null && position < 100 ? `Open ${position}%` : 'Open' };
}

const STATUS_WORDS: Record<CoverView['status'], string> = {
	open: 'Open',
	closed: 'Closed',
	opening: 'Opening…',
	closing: 'Closing…',
	unavailable: 'Unavailable',
};

/** The covering's icon in a tile: blue while it's open (any amount), pulsing while it moves. */
export const CoverTile: React.FC<{
	kind: WindowCover['kind'];
	open: boolean;
	moving?: boolean;
	className?: string;
}> = ({ kind, open, moving, className }) => {
	const Icon = kind === 'curtain' ? IconCurtains : Blinds;
	return (
		<div
			aria-hidden
			className={cn(
				'flex size-12 items-center justify-center rounded-lg transition-colors',
				open ? 'bg-info/15 text-info' : 'bg-muted text-muted-foreground',
				className,
			)}
		>
			<Icon size={22} className={cn(moving && 'animate-pulse')} />
		</div>
	);
};

/** One covering: its icon, name and state, the motors' battery, position, and open / stop / close. */
export const CoverRow: React.FC<{ cover: WindowCover; battery?: number; className?: string }> = ({
	cover,
	battery,
	className,
}) => {
	const { callService } = useHassApi();
	const { entityId, name, kind } = cover;
	const entity = useEntity(entityId);
	const [pending, setPending] = useState<'opening' | 'closing' | undefined>();
	// A move tapped here: the curtains report a position only as they start and finish, so it's
	// estimated along the way (ticking `now`) and settles on what the cover reports once it stops.
	// Moves started elsewhere show the reported position: their target isn't known.
	const [motion, setMotion] = useState<CoverMotion | null>(null);
	const [now, setNow] = useState(() => Date.now());
	// A slider being dragged shows the finger's value
	const [dragging, setDragging] = useState<number | null>(null);

	// Home Assistant says it moves: since the tap, else since the state changed. Past a full travel and
	// a grace period it's stalled, and shown at rest.
	const reportedMoving = entity?.state === 'opening' || entity?.state === 'closing';
	const since = motion?.startedAt ?? Date.parse(entity?.last_changed ?? '');
	const stalled = reportedMoving && !pending && now - since > FULL_TRAVEL_MS + STALL_GRACE_MS;
	const view = getCoverView(entity, pending, stalled);

	const unavailable = view.status === 'unavailable';
	const moving = view.status === 'opening' || view.status === 'closing';
	// Without a reported position, open and closed are all there is
	const reported = view.position ?? (view.status === 'closed' ? 0 : 100);
	const estimate = motion ? estimatePosition(motion, now) : reported;
	const position = dragging ?? estimate;

	// Reconcile: the cover moved or settled
	useEffect(() => {
		setPending(undefined);
	}, [entity?.state, entity?.attributes.current_position]);
	useEffect(() => {
		if (!pending) return;
		const timer = setTimeout(() => setPending(undefined), PENDING_TIMEOUT_MS);
		return () => clearTimeout(timer);
	}, [pending]);

	// The estimate ends when the move does (or stalls), or when the cover heads the other way
	useEffect(() => {
		if (!moving) setMotion(null);
		else
			setMotion((current) => (current && current.to > current.from !== (view.status === 'opening') ? null : current));
	}, [moving, view.status]);
	// Tick while anything moves: the estimate, and catching a stalled move
	const ticking = (reportedMoving && !stalled) || motion !== null;
	useEffect(() => {
		if (!ticking) return;
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), MOTION_TICK_MS);
		return () => clearInterval(timer);
	}, [ticking]);

	const go = (to: number) => {
		setMotion({ from: estimate, to, startedAt: Date.now() });
		setPending(to > estimate ? 'opening' : 'closing');
	};
	const move = (target: 'opening' | 'closing') => {
		go(target === 'opening' ? 100 : 0);
		callService('cover', target === 'opening' ? 'open_cover' : 'close_cover', { entity_id: entityId });
	};
	const stop = () => {
		setPending(undefined);
		callService('cover', 'stop_cover', { entity_id: entityId });
	};

	const curtain = kind === 'curtain';
	const tone = battery != null ? batteryTone(battery) : 'normal';
	const BatteryIcon = tone === 'normal' ? BatteryMedium : BatteryLow;

	return (
		// The tile, name and position on top; the slider and buttons under them, the row's full width. A
		// container, so the buttons drop their words when the row is narrow (a phone)
		<div className={cn('@container flex flex-col gap-3 p-4', className)}>
			<div className="flex items-center gap-3.5">
				<CoverTile
					kind={kind}
					open={!unavailable && position > 0}
					moving={moving}
					className={cn('shrink-0', unavailable && 'opacity-50')}
				/>
				<div className="flex min-w-0 flex-1 items-start justify-between gap-3">
					<div className="flex min-w-0 flex-col">
						<span className="truncate font-semibold">{name}</span>
						<span className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-sm">
							{/* The position is beside the name, so the status is just the word */}
							<span className="truncate">
								{STATUS_WORDS[view.status]}
								{/* A narrow row (a phone) puts the position here, leaving the name the width */}
								{!unavailable && <span className="@max-[20rem]:inline hidden tabular-nums"> · {position}%</span>}
							</span>
							{battery != null && (
								<span
									title={`Motor battery ${battery}%`}
									className={cn(
										'flex shrink-0 items-center gap-0.5 text-xs tabular-nums',
										tone === 'warning' && 'text-warning',
										tone === 'destructive' && 'text-destructive',
									)}
								>
									<BatteryIcon className="size-3.5" />
									{battery}%
								</span>
							)}
						</span>
					</div>
					{/* Room for "100%", so the name never shifts as the position changes */}
					{!unavailable && (
						<span className="@max-[20rem]:hidden min-w-[4ch] shrink-0 text-right font-light text-2xl tabular-nums leading-none">
							{position}
							<span className="text-muted-foreground text-sm">%</span>
						</span>
					)}
				</div>
			</div>

			{view.canSetPosition && (
				<Slider
					min={0}
					max={100}
					value={position}
					disabled={unavailable}
					onValueChange={setDragging}
					onValueCommit={(value) => {
						setDragging(null);
						go(value);
						callService('cover', 'set_cover_position', { entity_id: entityId, position: value });
					}}
					aria-label={`${name} position`}
				/>
			)}

			{/* While it moves, Stop alone (the whole row); once it stops, Open and Close. A cover that can't
				    stop keeps Open and Close throughout. A flex row, not equal grid columns, so neither squeezes
				    below its label; on a row under 20rem the words go and the icons stay. */}
			<div className="flex gap-2 *:flex-1">
				{moving && view.canStop ? (
					<Button variant="outline" size="xl" onClick={stop} aria-label={`Stop ${name}`}>
						<Square />
						<span className="@max-[20rem]:sr-only">Stop</span>
					</Button>
				) : (
					<>
						<Button
							variant={view.status === 'open' || view.status === 'opening' ? 'default' : 'outline'}
							size="xl"
							onClick={() => move('opening')}
							disabled={unavailable}
							aria-label={`Open ${name}`}
						>
							{curtain ? <ChevronsLeftRight /> : <ChevronsUp />}
							<span className="@max-[20rem]:sr-only">Open</span>
						</Button>
						<Button
							variant={view.status === 'closed' || view.status === 'closing' ? 'default' : 'outline'}
							size="xl"
							onClick={() => move('closing')}
							disabled={unavailable}
							aria-label={`Close ${name}`}
						>
							{curtain ? <ChevronsRightLeft /> : <ChevronsDown />}
							<span className="@max-[20rem]:sr-only">Close</span>
						</Button>
					</>
				)}
			</div>
		</div>
	);
};

/**
 * Every window covering in the house (curtains, blinds, shades; discovered, a cover group standing
 * for its motors) in one card: a row each, and Open all / Close all once there are several.
 * Nothing when there are none.
 */
export const CoversCard: React.FC<{ className?: string }> = ({ className }) => {
	const { callService } = useHassApi();
	const covers = useHassSelector((hass) => (hass ? discoverWindowCovers(hass, hass.states) : []), {
		watch: COVERS_WATCH,
	});
	// The motors' battery sensors, and whether each cover is open, for the header
	const batteryIds = new Set(covers.flatMap((c) => c.motors.map(batterySensorFor)));
	const coverIds = new Set(covers.map((c) => c.entityId));
	const states = useHassSelector((hass) => pickStates(hass?.states, (id) => batteryIds.has(id) || coverIds.has(id)), {
		watch: (id) => batteryIds.has(id) || coverIds.has(id),
	});
	if (covers.length === 0) return null;

	const ids = covers.map((c) => c.entityId);
	// As the rows read them (a curtain at 0–1% is closed whatever its state says)
	const openCount = covers.filter((c) => {
		const { status } = getCoverView(states[c.entityId]);
		return status === 'open' || status === 'opening';
	}).length;
	// "Curtains" or "Blinds" when they're all one kind, else "Windows" (short, so the header fits a phone)
	const kinds = new Set(covers.map((c) => (c.kind === 'curtain' ? 'Curtains' : 'Blinds')));
	const title = kinds.size === 1 ? [...kinds][0] : 'Windows';

	return (
		// A container, so Open all / Close all go icon-only when the card is narrow
		<Card className={cn('@container/covers gap-0 py-0', className)}>
			<CardHeader className="items-center gap-3 border-b px-4 py-3 [.border-b]:pb-3">
				<div className="flex min-w-0 items-center gap-3">
					<Blinds className="size-5 shrink-0 text-info" />
					<div className="min-w-0">
						<CardTitle className="truncate text-lg">{title}</CardTitle>
						<CardDescription className="truncate">
							{covers.length === 1
								? (covers[0].area ?? covers[0].name)
								: openCount === 0
									? 'All closed'
									: `${openCount} of ${covers.length} open`}
						</CardDescription>
					</div>
				</div>
				{covers.length > 1 && (
					<CardAction className="flex gap-2 self-center">
						<Button
							variant="outline"
							size="sm"
							onClick={() => callService('cover', 'open_cover', { entity_id: ids })}
							aria-label="Open all"
							title="Open all"
						>
							<ChevronsLeftRight />
							<span className="@max-[24rem]/covers:sr-only">Open all</span>
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => callService('cover', 'close_cover', { entity_id: ids })}
							aria-label="Close all"
							title="Close all"
						>
							<ChevronsRightLeft />
							<span className="@max-[24rem]/covers:sr-only">Close all</span>
						</Button>
					</CardAction>
				)}
			</CardHeader>
			{covers.map((cover, i) => (
				<Fragment key={cover.entityId}>
					{i > 0 && <Separator />}
					<CoverRow cover={cover} battery={lowestBattery(cover, states)} />
				</Fragment>
			))}
		</Card>
	);
};
