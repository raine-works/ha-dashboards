/**
 * Lighting's state and actions: the lights, scenes and bedtime toggles it reads, optimistic
 * toggles, dimming and scenes, All off with its Undo, and asking before a light wakes a room in
 * bedtime.
 *
 * @module
 */

import { useEffect, useMemo, useRef, useState } from 'preact/compat';
import { CONFIRM_TIMEOUT_MS, useHassApi, useHassSelector } from '../../context/HassContext';
import { type BedtimeRoom, bedtimeRoomOf } from '../../lib/bedtime';
import { pickStates } from '../../lib/hass-store';
import {
	HOUSEHOLD_LIGHT_LABEL,
	type LightAppearance,
	labeledLights,
	lightAppearance,
	lightCapabilities,
	ringColors,
	sceneLights,
} from '../../lib/lights';
import { isUnavailable } from '../../lib/values';
import type { HassEntity, HomeAssistant } from '../../types/homeassistant';
import { toast } from '../ui';

/** A light on screen: its entity and the name its row shows. */
export interface LightFixture {
	/** `light.*` entity; a light group's members follow it optimistically. */
	id: string;
	name: string;
}

// Give up waiting for "All Off" to show in Home Assistant after this long
/** All Off's snapshot (`scene.create`, replaced on every All Off), for its toast's Undo. */
const ALL_OFF_UNDO_SCENE = 'dashboard_all_off_undo';
/** How long All Off's toast (and its Undo) stays up. */
const ALL_OFF_UNDO_MS = 10_000;
const ALL_OFF_TIMEOUT_MS = 8000;
// Ignore Stateful Scenes' on → off → on flicker while a scene applies
const SCENE_HOLD_MS = 2500;

const NO_STATES: Record<string, HassEntity> = {};

/** Members of a light group (its `entity_id` attribute), or none. */
export function groupMembers(entity: HassEntity | undefined): string[] {
	const members = entity?.attributes.entity_id;
	return Array.isArray(members) ? members.map(String) : [];
}

/** 0–100 from Home Assistant's 0–255 brightness. */
export function brightnessPercent(entity: HassEntity | undefined): number {
	const raw = entity?.attributes.brightness;
	return typeof raw === 'number' ? Math.round((raw / 255) * 100) : 0;
}

// input_boolean: the rooms' bedtime toggles, which make turning their lights on ask first
const LIGHTING_DOMAINS = /^(light|switch|scene|input_boolean)\./;

/** What lighting reads from hass: registries, and the light, switch (Stateful Scenes), scene and bedtime toggle states. */
export type LightingHass = Pick<HomeAssistant, 'entities' | 'devices' | 'areas' | 'floors' | 'states'>;

/**
 * Lighting's slice of hass. Re-renders only when a light, switch or scene changes (or the
 * registries do), not on the house's every sensor update.
 */
export function useLightingHass(): LightingHass | null {
	return useHassSelector(
		(hass) =>
			hass
				? {
						entities: hass.entities,
						devices: hass.devices,
						areas: hass.areas,
						floors: hass.floors,
						states: pickStates(hass.states, (id) => LIGHTING_DOMAINS.test(id)),
					}
				: null,
		{ watch: (id) => LIGHTING_DOMAINS.test(id) },
	);
}

/** A light turning on in a room in bedtime, waiting for the person to confirm (`BedtimeLightDialog`). */
export interface BedtimeConfirm {
	room: BedtimeRoom;
	/** What turns on ("Sam's Room Desk Lamp", "Sam's Room lights", "the Relaxed scene"). */
	what: string;
	/** Turning lights on, or opening the colors dialog (whose picks turn them on). */
	kind: 'on' | 'adjust';
	run: () => void;
	/** Puts back what the gesture showed (a dimmer dragged up from off). */
	undo?: () => void;
}

const SCENE_SUFFIX = /\s*stateful scene$/i;

/** A light as its row shows it, with optimistic on/off and brightness. */
export interface FixtureState {
	entity?: HassEntity;
	unavailable: boolean;
	isOn: boolean;
	brightness: number;
	status: string;
	dimmable: boolean;
	adjustable: boolean;
	/** While on: its color, temperature or effect (lights that have them). */
	appearance?: LightAppearance;
}

/**
 * Light, scene and whole-house controls with optimistic state: toggles, dimming and scene
 * changes show at once and reconcile when Home Assistant reports them. `lightIds` are the
 * fixtures on screen (group members are added); Household Lights are always tracked for All Off.
 * `hass` is the section's own `useLightingHass()`, so the states are picked once per update.
 */
export function useLightControls(lightIds: string[], hass: LightingHass | null) {
	const { getHass, callService } = useHassApi();
	const liveStates = hass?.states ?? NO_STATES;
	const entities = hass?.entities;
	const householdLights = useMemo(() => (entities ? labeledLights({ entities }) : []), [entities]);

	const [optimisticLights, setOptimisticLights] = useState<Record<string, boolean>>({});
	const [localBrightness, setLocalBrightness] = useState<Record<string, number>>({});
	const [optimisticScenes, setOptimisticScenes] = useState<Record<string, boolean>>({});
	// Scene holds and optimistic lights' expiry
	const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

	useEffect(
		() => () => {
			for (const timer of timers.current) clearTimeout(timer);
		},
		[],
	);

	// Reconcile optimistic lights once Home Assistant confirms them
	const watched = [...lightIds.flatMap((id) => [id, ...groupMembers(liveStates[id])]), ...householdLights];
	const lightStateKey = watched.map((id) => liveStates[id]?.state).join(',');
	useEffect(() => {
		setOptimisticLights((prev) => {
			let changed = false;
			const next = { ...prev };
			for (const [id, target] of Object.entries(prev)) {
				const entity = liveStates[id];
				if (entity && (entity.state === 'on') === target) {
					delete next[id];
					changed = true;
				}
			}
			return changed ? next : prev;
		});
	}, [lightStateKey]);

	const isLightOn = (id: string) => optimisticLights[id] ?? liveStates[id]?.state === 'on';

	/**
	 * Optimistic lights go back to what Home Assistant reports if it hasn't confirmed them by then (a
	 * failed call, an unreachable bulb), so a light never shows on that isn't.
	 */
	const expireLights = (ids: string[], on: boolean) => {
		const timer = setTimeout(() => {
			timers.current.delete(timer);
			setOptimisticLights((prev) => {
				const next = { ...prev };
				let changed = false;
				for (const id of ids)
					if (next[id] === on) {
						delete next[id];
						changed = true;
					}
				return changed ? next : prev;
			});
		}, CONFIRM_TIMEOUT_MS);
		timers.current.add(timer);
	};

	// Turning a light on in a room in bedtime (its own toggle, not Home Bedtime) asks first
	const [bedtimeConfirm, setBedtimeConfirm] = useState<BedtimeConfirm | null>(null);
	const entityName = (id: string) => String(liveStates[id]?.attributes.friendly_name ?? id).replace(SCENE_SUFFIX, '');
	const guardBedtime = (ids: string[], confirm: Omit<BedtimeConfirm, 'room'>) => {
		const room = hass ? bedtimeRoomOf(hass, liveStates, ids) : undefined;
		if (room) setBedtimeConfirm({ room, ...confirm });
		else confirm.run();
	};
	const confirmBedtime = () => {
		bedtimeConfirm?.run();
		setBedtimeConfirm(null);
	};
	const cancelBedtime = () => {
		bedtimeConfirm?.undo?.();
		setBedtimeConfirm(null);
	};
	/** Open the colors dialog for these lights, asking first if it would turn one on in a room in bedtime. */
	const adjust = (ids: string[], name: string, open: () => void) =>
		guardBedtime(
			ids.filter((id) => !isLightOn(id)),
			{ what: name, kind: 'adjust', run: open },
		);

	const setOptimistic = (entityId: string, on: boolean) => {
		const ids = [entityId, ...groupMembers(liveStates[entityId])];
		setOptimisticLights((prev) => {
			const next = { ...prev };
			for (const id of ids) next[id] = on;
			return next;
		});
		expireLights(ids, on);
	};

	const switchLight = (entityId: string, target: boolean) => {
		setOptimistic(entityId, target);
		callService('light', target ? 'turn_on' : 'turn_off', { entity_id: entityId });
	};

	const toggleLight = (entityId: string) => {
		const target = !isLightOn(entityId);
		if (!target) switchLight(entityId, false);
		else guardBedtime([entityId], { what: entityName(entityId), kind: 'on', run: () => switchLight(entityId, true) });
	};

	const switchRoomLights = (ids: string[], on: boolean) => {
		setOptimisticLights((prev) => {
			const next = { ...prev };
			for (const id of ids) next[id] = on;
			return next;
		});
		expireLights(ids, on);
		callService('light', on ? 'turn_on' : 'turn_off', { entity_id: ids });
	};

	/** A room's switch; `name` (the room's) says what turns on if its bedtime asks first. */
	const setRoomLights = (ids: string[], on: boolean, name = 'these lights') => {
		if (!on) switchRoomLights(ids, false);
		else guardBedtime(ids, { what: name, kind: 'on', run: () => switchRoomLights(ids, true) });
	};

	/** Lights in `ids` that are on (optimistically), skipping ones Home Assistant doesn't know. */
	const countOn = (ids: string[]) => ids.filter((id) => liveStates[id] && isLightOn(id)).length;

	// Whole house: every Household Light (the label leaves out indicator LEDs and appliance lights)
	const householdOn = householdLights.filter((id) => liveStates[id]?.state === 'on');
	const [allOffPending, setAllOffPending] = useState(false);
	useEffect(() => {
		if (!allOffPending) return;
		if (householdOn.length === 0) {
			setAllOffPending(false);
			return;
		}
		const timer = setTimeout(() => setAllOffPending(false), ALL_OFF_TIMEOUT_MS);
		return () => clearTimeout(timer);
	}, [allOffPending, householdOn.length]);

	const turnOffHouse = async () => {
		const count = householdOn.length;
		const wereOn = [...householdOn];
		setAllOffPending(true);
		setOptimisticLights((prev) => {
			const next = { ...prev };
			for (const id of householdOn) next[id] = false;
			return next;
		});
		expireLights(wereOn, false);
		const hass = getHass();
		if (!hass) return;
		const undo = {
			label: 'Undo',
			onClick: () => {
				setOptimisticLights((prev) => {
					const next = { ...prev };
					for (const id of wereOn) next[id] = true;
					return next;
				});
				expireLights(wereOn, true);
				callService('scene', 'turn_on', { entity_id: `scene.${ALL_OFF_UNDO_SCENE}` });
			},
		};
		// Snapshot what's on (brightness, colors, effects) first, so Undo puts it back exactly
		// (promise chains, not try/catch, so the React Compiler keeps this hook)
		const undoable = await hass
			.callService('scene', 'create', { scene_id: ALL_OFF_UNDO_SCENE, snapshot_entities: wereOn })
			.then(
				() => true,
				(err: unknown) => {
					console.warn('No undo for All Off (scene.create failed):', err);
					return false;
				},
			);
		// label_id targets the label server-side, so lights labeled later are included too
		await hass.callService('light', 'turn_off', { label_id: HOUSEHOLD_LIGHT_LABEL }).then(
			() =>
				toast.success(`Turned off ${count} ${count === 1 ? 'light' : 'lights'}`, {
					description: 'Household lights',
					duration: ALL_OFF_UNDO_MS,
					action: undoable ? undo : undefined,
				}),
			(err: unknown) => {
				console.error('Failed to turn off household lights:', err);
				setAllOffPending(false);
				setOptimisticLights({});
				toast.error("Couldn't turn off the lights");
			},
		);
	};

	const setBrightness = (entityId: string, percent: number) => {
		if (percent > 0) setOptimistic(entityId, true);
		callService('light', 'turn_on', { entity_id: entityId, brightness: Math.round((percent / 100) * 255) });
	};

	/** A dimmer let go: its value shows until the light reports it (the row shows the drag itself). */
	const holdBrightness = (entityId: string, percent: number) =>
		setLocalBrightness((prev) => (prev[entityId] === percent ? prev : { ...prev, [entityId]: percent }));

	const dropLocalBrightness = (entityId: string) =>
		setLocalBrightness((prev) => {
			if (!(entityId in prev)) return prev;
			const next = { ...prev };
			delete next[entityId];
			return next;
		});

	// A set brightness shows until the light reports it (or the timeout), so the slider never jumps
	// back to the old level and forward again while a slow bulb catches up
	const committedBrightness = useRef(new Set<string>());
	const brightnessKey = Object.keys(localBrightness)
		.map((id) => `${id}=${liveStates[id]?.attributes.brightness}`)
		.join(',');
	useEffect(() => {
		for (const id of committedBrightness.current) {
			const target = localBrightness[id];
			if (target === undefined || Math.abs(brightnessPercent(liveStates[id]) - target) <= 1) {
				committedBrightness.current.delete(id);
				dropLocalBrightness(id);
			}
		}
	}, [brightnessKey]);

	const applyBrightness = (entityId: string, percent: number) => {
		setBrightness(entityId, percent);
		committedBrightness.current.add(entityId);
		setTimeout(() => {
			if (!committedBrightness.current.delete(entityId)) return;
			dropLocalBrightness(entityId);
		}, CONFIRM_TIMEOUT_MS);
	};

	// Dragging a light's dimmer up from off turns it on: in a room in bedtime it waits for the answer,
	// and a Cancel puts the dimmer back
	const commitBrightness = (entityId: string, percent: number) => {
		holdBrightness(entityId, percent);
		if (isLightOn(entityId) || percent === 0) applyBrightness(entityId, percent);
		else
			guardBedtime([entityId], {
				what: entityName(entityId),
				kind: 'on',
				run: () => applyBrightness(entityId, percent),
				undo: () => dropLocalBrightness(entityId),
			});
	};

	const isSceneOn = (id: string) => optimisticScenes[id] ?? liveStates[id]?.state === 'on';

	/** Toggle a scene; turning one on turns off the others in `group` (as Stateful Scenes does). */
	const toggleScene = (sceneId: string, group: string[] = []) => {
		if (isSceneOn(sceneId)) switchScene(sceneId, false, group);
		else
			guardBedtime([sceneId], {
				what: `the ${entityName(sceneId)} scene`,
				kind: 'on',
				run: () => switchScene(sceneId, true, group),
			});
	};

	const switchScene = (sceneId: string, target: boolean, group: string[]) => {
		const update: Record<string, boolean> = { [sceneId]: target };
		if (target) for (const id of group) if (id !== sceneId) update[id] = false;

		setOptimisticScenes((prev) => ({ ...prev, ...update }));
		callService('switch', target ? 'turn_on' : 'turn_off', { entity_id: sceneId });

		const timer = setTimeout(() => {
			timers.current.delete(timer);
			setOptimisticScenes((prev) => {
				const next = { ...prev };
				// A later toggle of the same scene owns its own hold
				for (const [id, value] of Object.entries(update)) if (next[id] === value) delete next[id];
				return next;
			});
		}, SCENE_HOLD_MS);
		timers.current.add(timer);
	};

	const fixtureState = (fixture: LightFixture): FixtureState => {
		const entity = liveStates[fixture.id];
		const unavailable = !entity || isUnavailable(entity.state);
		const isOn = !unavailable && isLightOn(fixture.id);
		const brightness = localBrightness[fixture.id] ?? brightnessPercent(entity);
		const { dimmable, adjustable } = lightCapabilities(entity);
		// Only once Home Assistant reports it on (an optimistic toggle has no color yet)
		const appearance = isOn ? lightAppearance(entity) : undefined;
		const detail = appearance?.detail ?? 'Active';
		let status = 'Off';
		if (unavailable) status = 'Unavailable';
		else if (isOn) status = dimmable ? `${brightness}% • ${detail}` : detail;
		return { entity, unavailable, isOn, brightness, status, dimmable, adjustable, appearance };
	};

	/** Whether any of these lights has colors, a temperature or effects (a room's colors button). */
	const anyAdjustable = (ids: string[]) => ids.some((id) => lightCapabilities(liveStates[id]).adjustable);

	/** A light's color ring: its color while it's on (and whether an effect runs). */
	const lightRing = (fixture: LightFixture) =>
		isLightOn(fixture.id) ? ringColors([liveStates[fixture.id]]) : { colors: [], effect: false };

	/** An active scene's ring: the colors its lights show now (none while the scene is off). */
	const sceneRing = (sceneId: string) =>
		hass && isSceneOn(sceneId)
			? ringColors(sceneLights(hass, liveStates, sceneId).map((id) => liveStates[id]))
			: { colors: [], effect: false };

	return {
		lightRing,
		sceneRing,
		isLightOn,
		toggleLight,
		setRoomLights,
		countOn,
		householdOn,
		allOffPending,
		turnOffHouse,
		commitBrightness,
		isSceneOn,
		toggleScene,
		fixtureState,
		anyAdjustable,
		adjust,
		bedtimeConfirm,
		confirmBedtime,
		cancelBedtime,
	};
}

/** What `useLightControls()` returns: the optimistic light, scene and All off state and actions. */
export type LightControls = ReturnType<typeof useLightControls>;
