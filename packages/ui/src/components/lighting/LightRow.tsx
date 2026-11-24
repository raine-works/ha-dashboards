/**
 * Lighting's rows: a light (switch, dimmer and colors button), a scene group, a room's scene chips
 * and the All off button.
 *
 * @module
 */

import { Lightbulb, Loader2, Palette, Power, Sparkles } from 'lucide-react';
import type React from 'preact/compat';
import { memo, useState } from 'preact/compat';
import { useStableCallbacks } from '../../hooks/useStableCallbacks';
import { deepEqual } from '../../lib/hass-store';
import { lightFill, showsLightControls } from '../../lib/lights';
import { cn } from '../../lib/utils';
import { Button, Card, Slider, Switch } from '../ui';
import { ColorRing } from './ColorRing';
import type { FixtureState, LightControls, LightFixture } from './useLightControls';

/** What the colors dialog sets: one fixture, or a room's lights (each setting reaching the lights that have it). */
export interface AdjustTarget {
	/** The fixture's entity, or the room's area id. */
	id: string;
	name: string;
	lightIds: string[];
}

/** A light row's fixture, the section's controls, and how it opens the colors dialog. */
export interface LightRowProps {
	fixture: LightFixture;
	controls: LightControls;
	/** Open the colors / temperature / effects dialog. */
	onAdjust: (fixture: AdjustTarget) => void;
	/** Its own card (a list of rows), or plain inside a room card. */
	variant?: 'card' | 'plain';
	className?: string;
}

/** What a light row does: the same functions every render (`useStableCallbacks`), so its view can skip. */
interface LightRowActions {
	toggle: () => void;
	commitBrightness: (value: number) => void;
	adjust: () => void;
}

/** "Adjust Floor Lamp colors & effects (now Candle)" */
export const adjustLabel = (name: string, state: FixtureState) =>
	`Adjust ${name} colors & effects${state.appearance ? ` (now ${state.appearance.detail})` : ''}`;

type LightRowViewProps = {
	fixture: LightFixture;
	state: FixtureState;
	ring: { colors: string[]; effect: boolean };
	actions: LightRowActions;
	variant: 'card' | 'plain';
	className?: string;
};

const LightRowViewContent: React.FC<LightRowViewProps> = ({
	fixture,
	state: shown,
	ring,
	actions,
	variant,
	className,
}) => {
	// The dimmer's value while it's dragged (until it's committed, and held by the controls): the row
	// shows it, not the section, so a drag re-renders one row
	const [preview, setPreview] = useState<number | null>(null);
	const state = preview === null ? shown : { ...shown, brightness: preview };
	const fill = lightFill(ring.colors);
	// While it's on, its toggle and dimmer take the light's color (their primary, with a foreground
	// that reads on it); without a reported color (a plain bulb, or just turned on) the theme's accent
	const lightColor =
		state.isOn && fill
			? ({ '--primary': fill.color, '--primary-foreground': fill.foreground } as React.CSSProperties)
			: undefined;
	const showControls = showsLightControls(state.isOn, preview !== null);
	const content = (
		<>
			{/* A ring only while an effect runs (turning); the light's color is the button's own */}
			<ColorRing colors={[]} effect={ring.effect}>
				<Button
					variant={state.isOn ? 'default' : 'secondary'}
					size="icon-xl"
					style={lightColor}
					onClick={actions.toggle}
					disabled={state.unavailable}
					aria-label={`Toggle ${fixture.name}`}
					aria-pressed={state.isOn}
				>
					<Lightbulb className="size-5" />
				</Button>
			</ColorRing>
			<div
				className={cn(
					'flex min-w-0 flex-col',
					state.dimmable && showControls ? 'w-28 shrink-0 max-lg:flex-1' : 'flex-1',
				)}
			>
				<span className="truncate font-semibold">{fixture.name}</span>
				<span className="truncate text-muted-foreground text-xs">
					{state.isOn
						? [state.dimmable ? `${state.brightness}%` : 'On', state.appearance?.detail].filter(Boolean).join(' · ')
						: state.status}
				</span>
			</div>
			{/* On/off-only lights (switches) get neither a dimmer nor the colors dialog */}
			{state.dimmable && showControls && (
				<div style={lightColor} className="min-w-0 flex-1 max-lg:order-last max-lg:basis-full max-lg:px-1">
					<Slider
						min={1}
						max={100}
						value={state.isOn ? state.brightness : 0}
						disabled={state.unavailable}
						onValueChange={setPreview}
						onValueCommit={(val) => {
							setPreview(null);
							actions.commitBrightness(val);
						}}
						aria-label={`${fixture.name} Brightness`}
					/>
				</div>
			)}
			{!showControls ? null : state.adjustable ? (
				<Button
					variant="outline"
					size="icon-xl"
					onClick={actions.adjust}
					disabled={state.unavailable}
					aria-label={adjustLabel(fixture.name, state)}
					title={adjustLabel(fixture.name, state)}
				>
					<Palette className="size-5" />
				</Button>
			) : (
				<span className="size-12 shrink-0" />
			)}
		</>
	);

	const layout = 'flex-row flex-wrap items-center gap-3 max-lg:gap-y-2';
	return variant === 'card' ? (
		<Card className={cn(layout, 'px-3 py-2 max-lg:py-3', className)}>{content}</Card>
	) : (
		<div className={cn('flex', layout, className)}>{content}</div>
	);
};

// Re-renders only when what it shows changes: its state and ring are worked out afresh on every
// lighting update (new objects, equal values), and its actions never change
const LightRowView = memo(
	LightRowViewContent,
	(prev, next) =>
		prev.actions === next.actions &&
		prev.variant === next.variant &&
		prev.className === next.className &&
		deepEqual(prev.fixture, next.fixture) &&
		deepEqual(prev.state, next.state) &&
		deepEqual(prev.ring, next.ring),
);

/**
 * One line per fixture: toggle, name/status, brightness, colors. Below lg the dimmer gets its own
 * line. Works out what the fixture shows, and its view (`memo`) re-renders only when that changes:
 * any light changing re-rendered every row in the list.
 */
export const LightRow: React.FC<LightRowProps> = ({ fixture, controls, onAdjust, variant = 'card', className }) => {
	const actions = useStableCallbacks({
		toggle: () => controls.toggleLight(fixture.id),
		commitBrightness: (value: number) => controls.commitBrightness(fixture.id, value),
		adjust: () => onAdjust({ id: fixture.id, name: fixture.name, lightIds: [fixture.id] }),
	});
	return (
		<LightRowView
			fixture={fixture}
			state={controls.fixtureState(fixture)}
			ring={controls.lightRing(fixture)}
			actions={actions}
			variant={variant}
			className={className}
		/>
	);
};

type SceneRowViewProps = {
	scene: { id: string; name: string; description?: string };
	isOn: boolean;
	ring: { colors: string[]; effect: boolean };
	toggle: () => void;
	variant: 'card' | 'plain';
	className?: string;
};

const SceneRowViewContent: React.FC<SceneRowViewProps> = ({ scene, isOn, ring, toggle, variant, className }) => {
	const fill = lightFill(ring.colors);
	const Row = variant === 'card' ? Card : 'div';
	return (
		<Row
			role="switch"
			aria-checked={isOn}
			aria-label={scene.name}
			tabIndex={0}
			onClick={toggle}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					toggle();
				}
			}}
			className={cn('flex cursor-pointer flex-row items-center gap-3 px-3 py-2 max-lg:py-3', className)}
		>
			{/* A ring only while an effect runs; an active scene's tile is filled with its lights' colors */}
			<ColorRing colors={[]} effect={ring.effect}>
				<span
					style={isOn && fill ? { background: fill.background, color: fill.foreground } : undefined}
					className={cn(
						'flex size-12 items-center justify-center rounded-lg',
						isOn ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground',
					)}
				>
					<Sparkles className="size-5" />
				</span>
			</ColorRing>
			<div className="flex min-w-0 flex-1 flex-col">
				<span className="truncate font-semibold">{scene.name}</span>
				{scene.description && (
					<span className="short:hidden truncate text-muted-foreground text-xs">{scene.description}</span>
				)}
			</div>
			{/* Shows the state; the whole row is the touch target (and the switch screen readers hear) */}
			<Switch checked={isOn} className="pointer-events-none" aria-hidden tabIndex={-1} />
		</Row>
	);
};

// Like the light rows: re-renders only when the scene, its state or its colors change
const SceneRowView = memo(
	SceneRowViewContent,
	(prev, next) =>
		prev.toggle === next.toggle &&
		prev.isOn === next.isOn &&
		prev.variant === next.variant &&
		prev.className === next.className &&
		deepEqual(prev.scene, next.scene) &&
		deepEqual(prev.ring, next.ring),
);

/**
 * One Stateful Scene, styled like a light row: its icon (filled with its lights' colors while it's
 * on), name and description, and a switch. The whole row toggles it; turning one on turns the others off.
 */
export const SceneRow: React.FC<{
	scene: { id: string; name: string; description?: string };
	controls: LightControls;
	/** Every scene in the group (one can be on at a time). */
	sceneIds: string[];
	/** Its own card, or plain inside a room's block. */
	variant?: 'card' | 'plain';
	className?: string;
}> = ({ scene, controls, sceneIds, variant = 'card', className }) => {
	const { toggle } = useStableCallbacks({ toggle: () => controls.toggleScene(scene.id, sceneIds) });
	return (
		<SceneRowView
			scene={scene}
			isOn={controls.isSceneOn(scene.id)}
			ring={controls.sceneRing(scene.id)}
			toggle={toggle}
			variant={variant}
			className={className}
		/>
	);
};

/**
 * A room's Stateful Scenes as chips, in its card: the one that's on filled with its lights' colors
 * (the theme's accent until they report one), the others outline. A tap turns one on (the room's
 * others off, as Stateful Scenes does), or the one that's on off; in a room in bedtime it asks first.
 * They wrap rather than scroll like a ChipRow: a room has a few, and every one (the one that's on
 * especially) should be in view in the 10.5" panels' narrow column.
 */
export const SceneChips: React.FC<{
	scenes: { id: string; name: string }[];
	controls: LightControls;
	/** The room, for the chips' group name. */
	room: string;
	className?: string;
}> = ({ scenes, controls, room, className }) => {
	const ids = scenes.map((scene) => scene.id);
	return (
		<div role="group" aria-label={`${room} scenes`} className={cn('flex flex-wrap gap-2', className)}>
			{scenes.map((scene) => {
				const isOn = controls.isSceneOn(scene.id);
				const fill = isOn ? lightFill(controls.sceneRing(scene.id).colors) : undefined;
				return (
					<Button
						key={scene.id}
						variant={isOn ? 'default' : 'outline'}
						size="sm"
						aria-pressed={isOn}
						onClick={() => controls.toggleScene(scene.id, ids)}
						style={fill ? { background: fill.background, color: fill.foreground } : undefined}
					>
						{/* The narrow column fits more names without it */}
						<Sparkles className="max-lg:hidden" />
						{scene.name}
					</Button>
				);
			})}
		</div>
	);
};

/**
 * All off: turns off every Household Light, counting the ones on (disabled while none is, or while
 * the last All Off is still settling).
 */
export const AllOffButton: React.FC<{ controls: LightControls; className?: string }> = ({ controls, className }) => {
	const count = controls.householdOn.length;
	return (
		<Button
			variant="outline"
			size="lg"
			onClick={controls.turnOffHouse}
			disabled={controls.allOffPending || count === 0}
			title="Turn off every household light"
			className={cn('shrink-0', className)}
		>
			{controls.allOffPending ? <Loader2 className="animate-spin" /> : <Power />}
			{/* At the end of its header, with room to grow into: a new count moves nothing else */}
			<span className="tabular-nums">{count > 0 ? `All off (${count})` : 'All off'}</span>
		</Button>
	);
};
