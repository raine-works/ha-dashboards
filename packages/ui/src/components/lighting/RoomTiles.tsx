/**
 * Rooms first: each room is a tile (its name and what's on), and its lights' switch, scenes, colors
 * and bedtime are in a dialog a tap away. A house's lighting is then a short grid you can
 * read at a glance instead of every light's slider at once.
 *
 * @module
 */

import { Lightbulb, Palette, Sparkles } from 'lucide-react';
import type React from 'preact/compat';
import { useEntity } from '../../context/HassContext';
import { lightFill, type RoomScene, roomSummary } from '../../lib/lights';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, SwitchRow, Tile } from '../ui';
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
 * A room's tile (docs/design/components.md): its icon (in its lights' colors while any is on), name
 * and status line; the whole tile opens the room, whose dialog has its lights' switch at the top.
 * One tap target, so the eye lands on the room, not on a second control inside it.
 */
export const RoomTile: React.FC<{
	room: HouseRoom;
	controls: LightControls;
	/** Its bedtime switch, when it has one (the status line says so while it's on). */
	bedtimeEntity?: string;
	onOpen: () => void;
}> = ({ room, controls, bedtimeEntity, onOpen }) => {
	const { ids, fill, summary, on } = useRoomState(room, controls, bedtimeEntity);
	const Icon = ids.length > 0 ? Lightbulb : Sparkles;
	return (
		<Tile
			icon={<Icon />}
			iconStyle={fill ? { background: fill.background, color: fill.foreground } : undefined}
			name={room.name}
			status={summary}
			on={on}
			onClick={onOpen}
			label={`${room.name}: ${summary}. Open`}
		/>
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
		<DialogContent size="detail" className="gap-4">
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
