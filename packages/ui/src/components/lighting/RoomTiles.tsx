/**
 * Rooms first: each room is a tile (its name, what's on, a power button), and its lights, scenes,
 * colors and bedtime are in a dialog a tap away. A house's lighting is then a short grid you can
 * read at a glance instead of every light's slider at once.
 *
 * @module
 */

import { Lightbulb, Palette, Power, Sparkles } from 'lucide-react';
import type React from 'preact/compat';
import { useEntity } from '../../context/HassContext';
import { lightFill, type RoomScene, roomSummary } from '../../lib/lights';
import { cn } from '../../lib/utils';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, SwitchRow } from '../ui';
import { BedtimeButton } from './BedtimeButton';
import { type AdjustTarget, LightRow, SceneChips } from './LightRow';
import type { LightControls, LightFixture } from './useLightControls';

/** A room in the house: its lights and its scenes. */
export interface HouseRoom {
	areaId: string;
	name: string;
	lights: LightFixture[];
	scenes: RoomScene[];
}

/** What a room shows now: how many lights are on, the colors they show, its scene that's on. */
function useRoomState(room: HouseRoom, controls: LightControls, bedtimeEntity?: string) {
	const ids = room.lights.map((light) => light.id);
	const onCount = controls.countOn(ids);
	const activeScene = room.scenes.find((scene) => controls.isSceneOn(scene.id));
	// The colors its lights show (a diagonal blend for several), for the tile's icon
	const fill = onCount > 0 ? lightFill(room.lights.flatMap((light) => controls.lightRing(light).colors)) : undefined;
	const bedtime = useEntity(bedtimeEntity ?? '')?.state === 'on';
	const summary = roomSummary({ onCount, lightCount: ids.length, activeScene: activeScene?.name, bedtime });
	return { ids, onCount, activeScene, fill, summary, on: onCount > 0 || !!activeScene };
}

/**
 * A room's tile: its icon (in its lights' colors while any is on), name and status line, and a
 * power button for its lights. A tap anywhere else opens the room.
 */
export const RoomTile: React.FC<{
	room: HouseRoom;
	controls: LightControls;
	/** Its bedtime switch, when it has one (the status line says so while it's on). */
	bedtimeEntity?: string;
	onOpen: () => void;
}> = ({ room, controls, bedtimeEntity, onOpen }) => {
	const { ids, onCount, fill, summary, on } = useRoomState(room, controls, bedtimeEntity);
	const Icon = ids.length > 0 ? Lightbulb : Sparkles;
	return (
		<div
			className={cn(
				'relative flex min-h-28 touch:min-h-32 flex-col justify-between gap-3 rounded-xl border bg-card p-3 text-card-foreground transition-colors',
				on && 'border-warning/30 bg-warning/5',
			)}
		>
			{/* The whole tile opens the room; the power button sits above it */}
			<button
				type="button"
				onClick={onOpen}
				aria-label={`${room.name}: ${summary}. Open`}
				className="absolute inset-0 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
			/>
			<div className="pointer-events-none flex items-start justify-between gap-2">
				<span
					style={fill ? { background: fill.background, color: fill.foreground } : undefined}
					className={cn(
						'flex size-11 shrink-0 items-center justify-center rounded-lg transition-colors',
						fill ? undefined : on ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground',
					)}
				>
					<Icon className="size-5" />
				</span>
				{ids.length > 0 && (
					<Button
						variant={onCount > 0 ? 'default' : 'secondary'}
						size="icon-lg"
						onClick={() => controls.setRoomLights(ids, onCount === 0, `the ${room.name} lights`)}
						aria-label={`${room.name} lights ${onCount > 0 ? 'off' : 'on'}`}
						aria-pressed={onCount > 0}
						loading={false}
						className="pointer-events-auto relative rounded-full"
					>
						<Power />
					</Button>
				)}
			</div>
			<div className="pointer-events-none min-w-0">
				<div className="truncate font-semibold">{room.name}</div>
				<div className={cn('truncate text-sm', on ? 'text-foreground/80' : 'text-muted-foreground')}>{summary}</div>
			</div>
		</div>
	);
};

/**
 * A room's dialog: its lights' switch, colors and bedtime, its scenes, then a row per light. A
 * sheet from the bottom edge on phones.
 */
export const RoomDialog: React.FC<{
	room: HouseRoom | null;
	controls: LightControls;
	bedtimeEntity?: string;
	onAdjust: (target: AdjustTarget) => void;
	onClose: () => void;
}> = ({ room, controls, bedtimeEntity, onAdjust, onClose }) => (
	<Dialog open={!!room} onOpenChange={(open) => !open && onClose()}>
		<DialogContent size="sheet" className="gap-4">
			{room && <RoomDialogBody room={room} controls={controls} bedtimeEntity={bedtimeEntity} onAdjust={onAdjust} />}
		</DialogContent>
	</Dialog>
);

const RoomDialogBody: React.FC<{
	room: HouseRoom;
	controls: LightControls;
	bedtimeEntity?: string;
	onAdjust: (target: AdjustTarget) => void;
}> = ({ room, controls, bedtimeEntity, onAdjust }) => {
	const { ids, onCount, summary } = useRoomState(room, controls, bedtimeEntity);
	return (
		<>
			<DialogHeader>
				<DialogTitle>{room.name}</DialogTitle>
				<DialogDescription>{summary}</DialogDescription>
			</DialogHeader>
			{(ids.length > 0 || bedtimeEntity) && (
				<div className="flex items-center gap-2">
					{ids.length > 0 && (
						<SwitchRow
							checked={onCount > 0}
							onCheckedChange={(next) => controls.setRoomLights(ids, next, `the ${room.name} lights`)}
							aria-label={`${room.name} lights`}
							className="min-w-0 flex-1 rounded-lg border px-3 py-2"
						>
							<span className="min-w-0 flex-1 truncate font-medium">{ids.length === 1 ? 'Light' : 'All lights'}</span>
						</SwitchRow>
					)}
					{ids.length > 1 && controls.anyAdjustable(ids) && (
						<Button
							variant="outline"
							size="icon-xl"
							onClick={() => onAdjust({ id: room.areaId, name: room.name, lightIds: ids })}
							aria-label={`Adjust ${room.name} colors & effects`}
							title={`Adjust ${room.name} colors & effects`}
						>
							<Palette className="size-5" />
						</Button>
					)}
					{bedtimeEntity && <BedtimeButton entityId={bedtimeEntity} name={room.name} />}
				</div>
			)}
			{room.scenes.length > 0 && <SceneChips scenes={room.scenes} controls={controls} room={room.name} />}
			{room.lights.length > 0 && (
				<div className="flex flex-col divide-y overflow-hidden rounded-xl border">
					{room.lights.map((fixture) => (
						<LightRow
							key={fixture.id}
							fixture={fixture}
							controls={controls}
							onAdjust={onAdjust}
							variant="plain"
							className="px-3 py-2 max-lg:py-3"
						/>
					))}
				</div>
			)}
		</>
	);
};
