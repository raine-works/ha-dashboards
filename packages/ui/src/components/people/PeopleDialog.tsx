import {
	BatteryChargingIcon,
	BatteryFullIcon,
	BatteryIcon,
	BatteryLowIcon,
	BatteryMediumIcon,
	BatteryWarningIcon,
	Loader2,
	LocateFixedIcon,
	MapPinIcon,
} from 'lucide-react';
import type React from 'preact/compat';
import { lazy, Suspense, useEffect, useMemo, useState } from 'preact/compat';
import { useHassSelector } from '../../context/HassContext';
import { useNow } from '../../hooks/useNow';
import {
	discoverPeople,
	formatAgo,
	formatDistance,
	locatedPeople,
	PEOPLE_WATCH,
	type PersonBattery,
	type PersonView,
	reverseGeocode,
} from '../../lib/people';
import { cn } from '../../lib/utils';
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
	Badge,
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '../ui';
import type { MapZone } from './PeopleMap';

// The map brings Leaflet (~150KB): loaded when the dialog first shows it, not with the page
const PeopleMap = lazy(() => import('./PeopleMap').then((m) => ({ default: m.PeopleMap })));

const Battery: React.FC<{ battery: PersonBattery }> = ({ battery }) => {
	const { level, charging } = battery;
	let Icon = BatteryIcon;
	if (charging) Icon = BatteryChargingIcon;
	else if (level <= 10) Icon = BatteryWarningIcon;
	else if (level <= 30) Icon = BatteryLowIcon;
	else if (level <= 70) Icon = BatteryMediumIcon;
	else Icon = BatteryFullIcon;

	let tone = 'text-muted-foreground';
	if (charging) tone = 'text-success';
	else if (level <= 20) tone = 'text-destructive';

	return (
		<span className={cn('flex items-center gap-1.5 text-sm tabular-nums', tone)}>
			<Icon className="size-4" />
			{level}%{/* The charging icon says it on small screens, where the label would wrap */}
			{charging && <span className="max-lg:hidden">· {battery.full ? 'Full' : 'Charging'}</span>}
		</span>
	);
};

/** Street and town for someone outside every zone (looked up once per spot). */
function usePlace(person: PersonView, enabled: boolean): string | null {
	const [place, setPlace] = useState<string | null>(null);
	const { latitude: lat, longitude: lon } = person;
	const lookup = enabled && !person.zone && lat != null && lon != null;
	useEffect(() => {
		if (!lookup || lat == null || lon == null) {
			setPlace(null);
			return;
		}
		let active = true;
		reverseGeocode(lat, lon).then((p) => active && setPlace(p));
		return () => {
			active = false;
		};
	}, [lookup, lat, lon]);
	return place;
}

const PersonTile: React.FC<{
	person: PersonView;
	isOpen: boolean;
	imperial: boolean;
	now: number;
	focused: boolean;
	onFocus: () => void;
}> = ({ person, isOpen, imperial, now, focused, onFocus }) => {
	const place = usePlace(person, isOpen);
	const located = person.latitude != null && person.longitude != null;

	let badge: 'success' | 'info' | 'outline' = 'outline';
	if (person.isHome) badge = 'success';
	else if (person.zone) badge = 'info';

	let where = 'Location unknown';
	if (person.isHome) where = 'At home';
	else if (place) where = place;
	else if (person.zone) where = `At ${person.zone.name}`;
	const distance =
		!person.isHome && person.distanceFromHome != null
			? `${formatDistance(person.distanceFromHome, imperial)} from home`
			: null;

	return (
		<button
			type="button"
			onClick={onFocus}
			disabled={!located}
			aria-pressed={focused}
			className={cn(
				'flex min-w-0 flex-col gap-3 overflow-hidden rounded-lg border p-3 text-left transition-colors hover:bg-accent/50 disabled:cursor-default disabled:hover:bg-transparent',
				focused && 'border-primary bg-accent/50',
			)}
		>
			<div className="flex min-w-0 items-center gap-3">
				<Avatar className={cn('size-12', !person.isHome && !person.zone && 'grayscale')}>
					<AvatarImage src={person.picture} alt={person.name} />
					<AvatarFallback>{person.initials}</AvatarFallback>
				</Avatar>
				<div className="flex min-w-0 flex-col gap-1">
					<span className="truncate font-semibold">{person.shortName}</span>
					<Badge variant={badge}>
						<MapPinIcon />
						{person.locationLabel}
					</Badge>
				</div>
			</div>
			<div className="flex min-w-0 flex-col gap-1">
				{/* Own lines, wrapping: some wall-panel WebViews don't clip `truncate` inside a button */}
				<span className="wrap-break-word line-clamp-2 text-sm">{where}</span>
				{distance && <span className="text-muted-foreground text-sm">{distance}</span>}
				<div className="flex items-center justify-between gap-2">
					{person.battery ? (
						<Battery battery={person.battery} />
					) : (
						<span className="text-muted-foreground text-sm">No battery info</span>
					)}
					<span className="shrink-0 text-muted-foreground text-xs">{formatAgo(person.updated, now)}</span>
				</div>
			</div>
		</button>
	);
};

export interface PeopleDialogProps {
	isOpen: boolean;
	onClose: () => void;
}

/** Where everyone is (zone, place, distance), their phone battery, and a map framing them all. */
export const PeopleDialog: React.FC<PeopleDialogProps> = ({ isOpen, onClose }) => {
	const [focus, setFocus] = useState<string | null>(null);
	const now = useNow(isOpen, 30_000);

	useEffect(() => {
		if (isOpen) setFocus(null);
	}, [isOpen]);

	const people = useHassSelector((hass) => (isOpen && hass ? discoverPeople(hass.states) : []), {
		watch: PEOPLE_WATCH,
	});
	const located = useMemo(() => locatedPeople(people), [people]);
	const zones = useHassSelector<MapZone[]>(
		(hass) =>
			isOpen && hass
				? Object.values(hass.states)
						.filter((s) => s.entity_id.startsWith('zone.') && !s.attributes.passive)
						.flatMap((s) => {
							const { latitude, longitude, radius } = s.attributes;
							return typeof latitude === 'number' && typeof longitude === 'number'
								? [{ entityId: s.entity_id, latitude, longitude, radius: typeof radius === 'number' ? radius : 100 }]
								: [];
						})
				: [],
		{ watch: ['zone'] },
	);

	const imperial = useHassSelector((hass) => hass?.config?.unit_system?.length === 'mi', { watch: [] });
	const homeCount = people.filter((p) => p.isHome).length;

	return (
		<Dialog open={isOpen} onOpenChange={(value) => !value && onClose()}>
			{/* With a map, the dialog takes the full height and the map every pixel the tiles leave
			    (at least 16rem; below that the dialog scrolls); a grid on phones too, whose full-screen
			    dialogs are otherwise a flex column that ignores these rows (the map got no height) */}
			<DialogContent
				size="workspace"
				className="grid grid-rows-[auto_auto_minmax(--spacing(64),1fr)] overflow-y-auto max-sm:grid"
			>
				<DialogHeader>
					<DialogTitle>Family</DialogTitle>
					<DialogDescription>
						{people.length === 0 ? 'No one is being tracked' : `${homeCount} of ${people.length} home`}
					</DialogDescription>
				</DialogHeader>

				<div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
					{people.map((person) => (
						<PersonTile
							key={person.entityId}
							person={person}
							isOpen={isOpen}
							imperial={imperial}
							now={now}
							focused={focus === person.entityId}
							onFocus={() => setFocus(focus === person.entityId ? null : person.entityId)}
						/>
					))}
				</div>

				{isOpen && located.length > 0 && (
					<div className="relative min-h-0">
						<Suspense
							fallback={
								<div className="flex h-full items-center justify-center gap-2 rounded-lg border text-muted-foreground text-sm">
									<Loader2 className="size-4 animate-spin" />
									Loading the map…
								</div>
							}
						>
							<PeopleMap people={located} zones={zones} focus={focus} className="h-full" />
						</Suspense>
						{focus && (
							<Button
								variant="secondary"
								size="sm"
								onClick={() => setFocus(null)}
								className="absolute top-3 right-3 z-10"
							>
								<LocateFixedIcon />
								Show everyone
							</Button>
						)}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
};
