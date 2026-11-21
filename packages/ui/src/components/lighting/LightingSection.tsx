import { Lightbulb, Palette, SquareStack } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useMemo, useState } from 'preact/compat';
import { useHassSelector } from '../../context/HassContext';
import { useWallPanel } from '../../context/WallPanel';
import {
	BEDTIME_DOMAINS,
	discoverBedtimeToggles,
	homeBedtimeEntity,
	memberArea,
	memberBedtimeRoom,
} from '../../lib/bedtime';
import {
	discoverHouseFloors,
	discoverHouseScenes,
	type FloorRoom,
	floorsInOrder,
	floorsNearestFirst,
	type RoomScene,
} from '../../lib/lights';
import { cn } from '../../lib/utils';
import { Button, Card, EmptyState, SwitchRow, Tabs, TabsContent, TabsList, TabsTrigger } from '../ui';
import { BedtimeButton } from './BedtimeButton';
import { BedtimeLightDialog } from './BedtimeLightDialog';
import { LightAdjustModal } from './LightAdjustModal';
import { type AdjustTarget, AllOffButton, LightRow, SceneChips, SceneRow } from './LightRow';
import { type LightFixture, useLightControls, useLightingHass } from './useLightControls';

export { BedtimeButton } from './BedtimeButton';
export { BedtimeDialog } from './BedtimeDialog';
export { BedtimeLightDialog } from './BedtimeLightDialog';
export { ColorRing } from './ColorRing';
export { LightAdjustModal } from './LightAdjustModal';
export { type AdjustTarget, AllOffButton, LightRow, SceneChips, SceneRow } from './LightRow';
export {
	brightnessPercent,
	groupMembers,
	type LightControls,
	type LightFixture,
	useLightControls,
} from './useLightControls';

import { withErrorBoundary } from '../layout/ErrorBoundary';
import { SECTION_SCROLLER } from '../layout/scroll';

export interface LightRoom {
	/** Tab label; a single room shows as "Fixtures". */
	name: string;
	fixtures: LightFixture[];
	/** Shown after the fixtures in this room's tab (e.g. a room's own controls). */
	extra?: React.ReactNode;
}

export interface LightScene {
	/** Stateful Scenes switch (`switch.<room>_<scene>_stateful_scene`). */
	id: string;
	name: string;
	description?: string;
}

export interface LightingSectionProps {
	title: string;
	subtitle: string;
	/** Configured rooms, a tab each. */
	rooms?: LightRoom[];
	/**
	 * The panel's floor id: a Lights tab with every Household Light in the house, by floor and room,
	 * this floor first and then the nearest (discovered from the area/floor registries, so a new
	 * light appears once labeled).
	 */
	floor?: string;
	/**
	 * Without a `floor` (a dashboard that isn't on one): every floor's lights and scenes, top floor
	 * first, like looking at the house.
	 */
	allFloors?: boolean;
	/**
	 * Hand-picked scenes for the Scenes tab; turning one on turns the others off (as Stateful Scenes
	 * does). Without them, a panel with a `floor` lists every room's Stateful Scenes, by floor and
	 * room, this floor first.
	 */
	scenes?: LightScene[];
	/**
	 * The page scrolls rather than the section (the Home dashboard on phones): the tabs and floor
	 * names stick under Home Assistant's toolbar (and a sticky page header, `--page-header`) as the
	 * page scrolls, instead of inside the section.
	 */
	pageScroll?: boolean;
}

/** Lights (every floor's, this one first, or configured rooms) plus stateful scenes. Optimistic toggles reconcile when Home Assistant reports the change. */
const LightingSectionContent: React.FC<LightingSectionProps> = ({
	title,
	subtitle,
	rooms = [],
	floor,
	allFloors = false,
	scenes,
	pageScroll = false,
}) => {
	const hass = useLightingHass();
	const houseWide = !!floor || allFloors;
	// The integration's Home Bedtime, else a house's own
	const homeBedtime = useHassSelector((current) => homeBedtimeEntity(current?.states), { watch: BEDTIME_DOMAINS });

	// This floor first, then the nearest; or, off any floor, top floor first (discoverHouseFloors'
	// own order by level)
	// The registries on their own, so what reads only them recomputes only when they change
	const floors = hass?.floors;
	const entities = hass?.entities;
	const devices = hass?.devices;
	const floorOrder = useMemo(() => (floor && floors ? floorsNearestFirst(floors, floor) : []), [floor, floors]);
	// Re-run on state updates too: unnamed registry entries take their friendly name from the state
	const houseFloors = useMemo(
		() =>
			houseWide && hass ? discoverHouseFloors(hass, hass.states, floorOrder).filter((f) => f.rooms.length > 0) : [],
		[houseWide, floorOrder, hass],
	);
	// A private scene shows only to the household members of its room (their person's area), so
	// never on a wall panel (shared, no one signed in)
	const wallPanel = useWallPanel();
	const ownArea = useHassSelector((h) => (h && !wallPanel ? memberArea(h) : undefined), {
		watch: (id) => id.startsWith('person.'),
	});
	const houseScenes = useMemo(
		() => (houseWide && hass && !scenes ? discoverHouseScenes(hass, hass.states, floorOrder, ownArea) : []),
		[houseWide, floorOrder, hass, scenes, ownArea],
	);

	// Bedtime: a wall panel (shared, no one signed in) has Home Bedtime in the header and each room's
	// toggle in its room; a personal device only the signed-in member's room (their person's area),
	// in the header, so a room with no lights yet still has it
	const bedtimeToggles = useMemo(
		() => (wallPanel && entities && devices ? discoverBedtimeToggles({ entities, devices }) : {}),
		[wallPanel, entities, devices],
	);
	const memberRoom = useHassSelector((h) => (h && !wallPanel ? memberBedtimeRoom(h) : undefined), {
		watch: (id) => id.startsWith('person.'),
	});

	const [activeTab, setActiveTab] = useState(houseWide ? 'floor' : 'room-0');
	const [selectedFixture, setSelectedFixture] = useState<AdjustTarget | null>(null);
	// On a scrolling page the title, its buttons and the tabs stick together: their height, for the
	// floor names sticking under them
	const [stuck, setStuck] = useState<HTMLDivElement | null>(null);
	const [stuckHeight, setStuckHeight] = useState(0);
	useEffect(() => {
		if (!stuck) return;
		const observer = new ResizeObserver(() => setStuckHeight(stuck.offsetHeight));
		observer.observe(stuck);
		return () => observer.disconnect();
	}, [stuck]);

	const controls = useLightControls(
		[
			...rooms.flatMap((room) => room.fixtures.map((f) => f.id)),
			...houseFloors.flatMap((f) => f.rooms.flatMap((room) => room.lights.map((light) => light.id))),
		],
		hass,
	);
	const sceneIds = (scenes ?? []).map((scene) => scene.id);
	// Hand-picked scenes keep a tab of their own; the house's are in their rooms' cards
	const hasScenes = (scenes?.length ?? 0) > 0;

	// Each floor's rooms, with their lights and their scenes together (a room with scenes but no
	// Household Lights still gets a card)
	const houseRooms = useMemo(() => {
		const byFloor = new Map<
			string,
			{
				floorId: string;
				name: string;
				rooms: Map<string, { areaId: string; name: string; lights: FloorRoom['lights']; scenes: RoomScene[] }>;
			}
		>();
		const floorOf = (floorId: string, name: string) => {
			const found = byFloor.get(floorId) ?? { floorId, name, rooms: new Map() };
			byFloor.set(floorId, found);
			return found;
		};
		for (const f of houseFloors)
			for (const room of f.rooms) floorOf(f.floorId, f.name).rooms.set(room.areaId, { ...room, scenes: [] });
		for (const f of houseScenes)
			for (const room of f.rooms) {
				const rooms = floorOf(f.floorId, f.name).rooms;
				const found = rooms.get(room.areaId);
				if (found) found.scenes = room.scenes;
				else rooms.set(room.areaId, { areaId: room.areaId, name: room.name, lights: [], scenes: room.scenes });
			}
		// The floors in their order (this one first, then the nearest): a floor with only scenes takes its place too
		return floorsInOrder(floors, floorOrder).flatMap((floor) => {
			const f = byFloor.get(floor.floor_id);
			return f ? [{ ...f, rooms: [...f.rooms.values()].sort((a, b) => a.name.localeCompare(b.name)) }] : [];
		});
	}, [houseFloors, houseScenes, floors, floorOrder]);

	const tabs = rooms.map((room, i) => ({ value: `room-${i}`, label: rooms.length === 1 ? 'Fixtures' : room.name }));
	if (houseWide) tabs.unshift({ value: 'floor', label: 'Lights' });
	if (hasScenes) tabs.push({ value: 'scenes', label: 'Scenes' });
	const tabList = (
		<TabsList className="h-11 w-full">
			{tabs.map((tab) => (
				<TabsTrigger key={tab.value} value={tab.value}>
					{tab.label}
				</TabsTrigger>
			))}
		</TabsList>
	);

	// Scrolls on its own in a fixed-height column; on a scrolling page the page does (an overflow here
	// would make it the floor names' scroller, so they'd never stick)
	// In a panel, the list scrolls to the screen's bottom edge, like the other columns
	const scroller = pageScroll ? undefined : SECTION_SCROLLER;
	// Floor names stay in view while their rooms scroll: under the sticky title and tabs on a scrolling page
	const floorHeading = cn(
		'sticky z-10 bg-background px-2 py-1 font-semibold text-muted-foreground text-xs uppercase tracking-wide',
		pageScroll ? 'top-[calc(var(--panel-top)+var(--page-header,0px)+var(--lighting-header,0px))]' : 'top-0',
	);

	// The colors dialog, asking first in a room in bedtime (its picks turn the lights on)
	const openAdjust = (target: AdjustTarget) =>
		controls.adjust(target.lightIds, target.name, () => setSelectedFixture(target));

	const renderRow = (fixture: LightFixture) => (
		<LightRow key={fixture.id} fixture={fixture} controls={controls} onAdjust={openAdjust} />
	);
	// A light inside its room's block, padded like a light card so it lines up with the room's header
	const renderPlainRow = (fixture: LightFixture) => (
		<LightRow
			key={fixture.id}
			fixture={fixture}
			controls={controls}
			onAdjust={openAdjust}
			variant="plain"
			className="px-3 py-2 max-lg:py-3"
		/>
	);

	return (
		<section
			className="flex h-full min-h-0 min-w-0 flex-col"
			style={pageScroll ? { '--lighting-header': `${stuckHeight}px` } : undefined}
		>
			<Tabs value={activeTab} onValueChange={setActiveTab} className="min-h-0 flex-1 gap-4">
				{/* On a scrolling page (the phone's Lights tab) the title, its buttons and the tabs stick under
				    the page header as one block, a direct child of the tabs (which span the list), so it
				    sticks the whole way down */}
				<div
					ref={pageScroll ? setStuck : undefined}
					className={cn(
						'flex flex-col gap-3',
						pageScroll &&
							'sticky top-[calc(var(--panel-top)+var(--page-header,0px))] z-20 -mx-4 -my-2 bg-background px-4 py-2',
					)}
				>
					<div className="flex items-center justify-between gap-3 px-2">
						<div className="flex min-w-0 items-center gap-3">
							<Lightbulb className="size-6 shrink-0 text-amber-500 dark:text-amber-400" />
							<div className="min-w-0">
								<h2 className="truncate font-semibold text-lg leading-tight">{title}</h2>
								<p className="truncate text-muted-foreground text-sm max-lg:hidden">{subtitle}</p>
							</div>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							{wallPanel ? (
								<BedtimeButton entityId={homeBedtime} name="Home" labeled compact />
							) : (
								memberRoom && (
									<BedtimeButton entityId={memberRoom.entityId} name={memberRoom.name} labeled houseOption />
								)
							)}
							<AllOffButton controls={controls} />
						</div>
					</div>
					{tabs.length > 1 && tabList}
				</div>

				{houseWide && (
					<TabsContent value="floor" className={cn('flex min-h-0 flex-col gap-4', scroller)}>
						{houseRooms.length === 0 && (
							<EmptyState icon={<Lightbulb className="size-10" />}>No Household Lights yet.</EmptyState>
						)}
						{/* This floor first, then the nearest; each floor's name stays in view while its rooms scroll */}
						{houseRooms.map((houseFloor) => (
							<div key={houseFloor.floorId} className="flex shrink-0 flex-col gap-3">
								<h3 className={floorHeading}>{houseFloor.name}</h3>
								{houseFloor.rooms.map((room) => {
									const ids = room.lights.map((light) => light.id);
									const onCount = controls.countOn(ids);
									return (
										// Each room is one block: a tinted header (the room's switch, colors and scenes) over its lights
										<Card key={room.areaId} className="shrink-0 gap-0 overflow-hidden py-0">
											<div className={cn('flex flex-col gap-2 bg-muted/50 px-3 py-2', ids.length > 0 && 'border-b')}>
												<div className="flex items-center gap-3">
													{ids.length > 0 ? (
														<SwitchRow
															checked={onCount > 0}
															onCheckedChange={(on) => controls.setRoomLights(ids, on, `the ${room.name} lights`)}
															aria-label={`${room.name} lights`}
															className="-mx-2 min-w-0 flex-1 rounded-md px-2 py-1"
														>
															{/* A room, not a light: stacked squares (a group) on a soft tile, amber-tinted while any of its lights are on */}
															<span
																className={cn(
																	'flex size-12 shrink-0 items-center justify-center rounded-lg transition-colors',
																	onCount > 0 ? 'bg-amber-500/15 dark:bg-amber-400/15' : 'bg-muted',
																)}
															>
																<SquareStack
																	className={cn(
																		'size-5',
																		onCount > 0 ? 'text-amber-500 dark:text-amber-400' : 'text-muted-foreground',
																	)}
																/>
															</span>
															<div className="min-w-0 flex-1">
																<h4 className="truncate font-semibold text-base">{room.name}</h4>
																<p className="text-muted-foreground text-xs">
																	{onCount === 0 ? 'All off' : `${onCount} of ${ids.length} on`}
																</p>
															</div>
														</SwitchRow>
													) : (
														<h4 className="min-w-0 flex-1 truncate py-1 font-semibold text-base">{room.name}</h4>
													)}
													{/* The room's colors and effects, in line with its lights' own colors buttons */}
													{ids.length > 1 && controls.anyAdjustable(ids) && (
														<Button
															variant="outline"
															size="icon-xl"
															onClick={() => openAdjust({ id: room.areaId, name: room.name, lightIds: ids })}
															aria-label={`Adjust ${room.name} colors & effects`}
															title={`Adjust ${room.name} colors & effects`}
														>
															<Palette className="size-5" />
														</Button>
													)}
													{bedtimeToggles[room.areaId] && (
														<BedtimeButton entityId={bedtimeToggles[room.areaId]} name={room.name} />
													)}
												</div>
												{/* Its scenes, one on at a time, right where its lights are */}
												{room.scenes.length > 0 && (
													<SceneChips scenes={room.scenes} controls={controls} room={room.name} />
												)}
											</div>
											<div className="flex flex-col divide-y">{room.lights.map(renderPlainRow)}</div>
										</Card>
									);
								})}
							</div>
						))}
					</TabsContent>
				)}

				{rooms.map((room, i) => (
					<TabsContent key={room.name} value={`room-${i}`} className={cn('flex min-h-0 flex-col gap-3', scroller)}>
						{room.fixtures.map(renderRow)}
						{room.extra}
					</TabsContent>
				))}

				{hasScenes && (
					<TabsContent value="scenes" className={cn('flex min-h-0 flex-col gap-3', scroller)}>
						{scenes?.map((scene) => (
							<SceneRow key={scene.id} scene={scene} controls={controls} sceneIds={sceneIds} />
						))}
					</TabsContent>
				)}
			</Tabs>

			<BedtimeLightDialog controls={controls} />
			<LightAdjustModal isOpen={!!selectedFixture} onClose={() => setSelectedFixture(null)} target={selectedFixture} />
		</section>
	);
};

/** Lighting; a crash here leaves the rest of the panel working. */
export const LightingSection = withErrorBoundary(LightingSectionContent, 'Lighting');
