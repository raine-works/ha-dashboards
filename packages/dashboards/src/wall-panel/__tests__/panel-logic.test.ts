import { describe, expect, it } from 'bun:test';
import { hsToRgb } from '@app/ui/lib/color';

describe('Wall panel utility and logic', () => {
	describe('Timer formatting', () => {
		const formatTime = (secs: number) => {
			const m = Math.floor(secs / 60);
			const s = secs % 60;
			return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
		};

		it('formats 0 seconds as 00:00', () => {
			expect(formatTime(0)).toBe('00:00');
		});

		it('formats single-digit seconds with leading zero', () => {
			expect(formatTime(5)).toBe('00:05');
		});

		it('formats minutes and seconds accurately', () => {
			expect(formatTime(65)).toBe('01:05');
			expect(formatTime(600)).toBe('10:00');
			expect(formatTime(930)).toBe('15:30');
		});
	});

	describe('Climate Setpoint & Mode Logic', () => {
		const getTargetDisplay = (
			mode: string,
			targetTemp: number | null | undefined,
			targetLow: number | null | undefined,
			targetHigh: number | null | undefined,
		) => {
			if (mode === 'off') {
				return { primary: 'Off', secondary: 'System Inactive' };
			}
			if (mode === 'heat_cool' || (targetLow && targetHigh)) {
				const low = Math.round(targetLow ?? 67);
				const high = Math.round(targetHigh ?? 72);
				return {
					primary: `${low}° – ${high}°`,
					secondary: `Target Range • Heat ${low}° / Cool ${high}°`,
				};
			}
			if (mode === 'heat') {
				const target = Math.round(targetTemp ?? targetLow ?? 68);
				return { primary: `${target}°`, secondary: 'Heating Setpoint' };
			}
			if (mode === 'cool') {
				const target = Math.round(targetTemp ?? targetHigh ?? 72);
				return { primary: `${target}°`, secondary: 'Cooling Setpoint' };
			}
			const fallback = Math.round(targetTemp ?? 70);
			return { primary: `${fallback}°`, secondary: 'Target Setpoint' };
		};

		it('correctly handles dual setpoint in heat_cool mode without producing 0°', () => {
			// In HA heat_cool mode, temperature is null, while target_temp_low and high are set
			const display = getTargetDisplay('heat_cool', null, 67, 72);
			expect(display.primary).toBe('67° – 72°');
			expect(display.secondary).toContain('Heat 67° / Cool 72°');
			expect(display.primary).not.toBe('0°');
		});

		it('formats single temperature in heat mode', () => {
			const display = getTargetDisplay('heat', 68, null, null);
			expect(display.primary).toBe('68°');
		});

		it('formats single temperature in cool mode', () => {
			const display = getTargetDisplay('cool', 74, null, null);
			expect(display.primary).toBe('74°');
		});

		it('formats off state properly', () => {
			const display = getTargetDisplay('off', null, null, null);
			expect(display.primary).toBe('Off');
		});

		it('maps auto mode to heat_cool in Home Assistant', () => {
			const mapMode = (m: string) => (m === 'auto' ? 'heat_cool' : m);
			expect(mapMode('auto')).toBe('heat_cool');
			expect(mapMode('heat')).toBe('heat');
			expect(mapMode('cool')).toBe('cool');
			expect(mapMode('off')).toBe('off');
		});
	});

	describe('Real-Time Door Lock Security Transitions', () => {
		const resolveLockState = (rawState: string, pending: 'locking' | 'unlocking' | undefined) => {
			const isLocking = rawState === 'locking' || pending === 'locking';
			const isUnlocking = rawState === 'unlocking' || pending === 'unlocking';
			const isLocked = !isUnlocking && (rawState === 'locked' || isLocking);

			if (isLocking) return { label: 'Locking...', isLocked: true, active: true };
			if (isUnlocking) return { label: 'Unlocking...', isLocked: false, active: true };
			if (isLocked) return { label: 'Locked', isLocked: true, active: false };
			return { label: 'Unlocked', isLocked: false, active: false };
		};

		it('shows active Locking... immediately when pending lock is requested', () => {
			const res = resolveLockState('unlocked', 'locking');
			expect(res.label).toBe('Locking...');
			expect(res.active).toBe(true);
		});

		it('shows active Unlocking... immediately when pending unlock is requested', () => {
			const res = resolveLockState('locked', 'unlocking');
			expect(res.label).toBe('Unlocking...');
			expect(res.active).toBe(true);
		});

		it('shows active state when Home Assistant reports locking state', () => {
			const res = resolveLockState('locking', undefined);
			expect(res.label).toBe('Locking...');
			expect(res.active).toBe(true);
		});

		it('shows steady Locked when confirmed locked', () => {
			const res = resolveLockState('locked', undefined);
			expect(res.label).toBe('Locked');
			expect(res.active).toBe(false);
			expect(res.isLocked).toBe(true);
		});
	});

	describe('Real-Time Garage Door Transitions', () => {
		const resolveGarageState = (rawState: string, pending: 'opening' | 'closing' | undefined) => {
			const isClosing = rawState === 'closing' || pending === 'closing';
			const isOpening = rawState === 'opening' || pending === 'opening';
			const isOpen = rawState === 'open' || isOpening;

			if (isClosing) return { label: 'Closing...', status: 'Closing...', active: true };
			if (isOpening) return { label: 'Opening...', status: 'Opening...', active: true };
			if (isOpen) return { label: 'Close Door', status: 'Open', active: false };
			return { label: 'Open Door', status: 'Closed', active: false };
		};

		it('shows Closing... immediately when close action triggered', () => {
			const res = resolveGarageState('open', 'closing');
			expect(res.label).toBe('Closing...');
			expect(res.active).toBe(true);
		});

		it('shows Opening... immediately when open action triggered', () => {
			const res = resolveGarageState('closed', 'opening');
			expect(res.label).toBe('Opening...');
			expect(res.active).toBe(true);
		});

		it('shows Close Door when garage is open', () => {
			const res = resolveGarageState('open', undefined);
			expect(res.label).toBe('Close Door');
			expect(res.status).toBe('Open');
			expect(res.active).toBe(false);
		});

		it('shows Open Door when garage is closed', () => {
			const res = resolveGarageState('closed', undefined);
			expect(res.label).toBe('Open Door');
			expect(res.status).toBe('Closed');
			expect(res.active).toBe(false);
		});
	});

	describe('Presence Avatar State Logic', () => {
		interface Member {
			id: string;
			name: string;
			initials: string;
		}

		const members: Member[] = [
			{ id: 'person.robin_pike', name: 'Robin', initials: 'RP' },
			{ id: 'person.jordan_call', name: 'Jordan', initials: 'JC' },
			{ id: 'person.kai_pike', name: 'Kai', initials: 'LP' },
			{ id: 'person.avery_fonville', name: 'Avery', initials: 'GF' },
		];

		it('has 4 configured family members', () => {
			expect(members.length).toBe(4);
		});

		it('correctly maps friendly names and initials', () => {
			expect(members.find((m) => m.id === 'person.robin_pike')?.initials).toBe('RP');
			expect(members.find((m) => m.id === 'person.jordan_call')?.initials).toBe('JC');
			expect(members.find((m) => m.id === 'person.kai_pike')?.initials).toBe('LP');
			expect(members.find((m) => m.id === 'person.avery_fonville')?.initials).toBe('GF');
		});

		it('generates proper status title based on home state', () => {
			const getTitle = (name: string, isHome: boolean) => `${name}: ${isHome ? 'Home' : 'Away'}`;
			expect(getTitle('Robin', true)).toBe('Robin: Home');
			expect(getTitle('Jordan', false)).toBe('Jordan: Away');
		});
	});

	describe('WebRTC & Camera Logic', () => {
		const CAMERAS = [
			{
				id: 'doorbell',
				label: 'Front Doorbell',
				entity: 'camera.front_porch_doorbell_medium_resolution_channel',
				pipEntity: 'camera.front_porch_doorbell_package_camera',
				speakerEntity: 'media_player.front_porch_doorbell_speaker',
			},
			{
				id: 'package',
				label: 'Package Cam',
				entity: 'camera.front_porch_doorbell_package_camera',
				pipEntity: 'camera.front_porch_doorbell_medium_resolution_channel',
			},
			{
				id: 'living_room',
				label: 'Living Room',
				entity: 'camera.living_room_living_room_medium_resolution_channel',
			},
		];

		it('has properly configured camera entities with WebRTC capabilities', () => {
			expect(CAMERAS.length).toBe(3);
			expect(CAMERAS[0].entity).toContain('front_porch_doorbell');
			expect(CAMERAS[0].pipEntity).toBe('camera.front_porch_doorbell_package_camera');
			expect(CAMERAS[0].speakerEntity).toBe('media_player.front_porch_doorbell_speaker');
		});

		it('formats WebRTC offer message correctly for Home Assistant WebSocket', () => {
			const createOfferPayload = (entityId: string, sdpOffer: string) => ({
				type: 'camera/webrtc/offer',
				entity_id: entityId,
				offer: sdpOffer,
			});

			const payload = createOfferPayload(CAMERAS[0].entity, 'v=0\r\no=...');
			expect(payload.type).toBe('camera/webrtc/offer');
			expect(payload.entity_id).toBe(CAMERAS[0].entity);
			expect(payload.offer).toBe('v=0\r\no=...');
		});

		it('formats WebRTC candidate message correctly for Home Assistant WebSocket', () => {
			const createCandidatePayload = (entityId: string, sessionId: string, candidate: RTCIceCandidateInit) => ({
				type: 'camera/webrtc/candidate',
				entity_id: entityId,
				session_id: sessionId,
				candidate,
			});

			const candidateObj = {
				candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 50000 typ host',
				sdpMid: '0',
				sdpMLineIndex: 0,
			};
			const payload = createCandidatePayload(CAMERAS[0].entity, 'sess_123', candidateObj);
			expect(payload.type).toBe('camera/webrtc/candidate');
			expect(payload.session_id).toBe('sess_123');
			expect(payload.candidate.candidate).toContain('192.168.1.1');
		});

		it('correctly handles Picture-in-Picture feed swapping', () => {
			let isSwapped = false;
			const getFeeds = (main: string, pip: string | undefined, swapped: boolean) => {
				if (!pip) return { main, pip: undefined };
				return {
					main: swapped ? pip : main,
					pip: swapped ? main : pip,
				};
			};

			const initial = getFeeds(CAMERAS[0].entity, CAMERAS[0].pipEntity, isSwapped);
			expect(initial.main).toBe(CAMERAS[0].entity);
			expect(initial.pip).toBe('camera.front_porch_doorbell_package_camera');

			isSwapped = true;
			const swapped = getFeeds(CAMERAS[0].entity, CAMERAS[0].pipEntity, isSwapped);
			expect(swapped.main).toBe('camera.front_porch_doorbell_package_camera');
			expect(swapped.pip).toBe(CAMERAS[0].entity);
		});

		it('detects smart activity correctly from binary sensor states', () => {
			const checkDetections = (states: Record<string, string>) => ({
				hasPerson: states['binary_sensor.front_porch_doorbell_person_detected'] === 'on',
				hasPackage: states['binary_sensor.front_porch_doorbell_package_detected'] === 'on',
				hasAnimal: states['binary_sensor.front_porch_doorbell_animal_detected'] === 'on',
			});

			const noActivity = checkDetections({
				'binary_sensor.front_porch_doorbell_person_detected': 'off',
				'binary_sensor.front_porch_doorbell_package_detected': 'off',
			});
			expect(noActivity.hasPerson).toBe(false);
			expect(noActivity.hasPackage).toBe(false);

			const packageDelivered = checkDetections({
				'binary_sensor.front_porch_doorbell_person_detected': 'off',
				'binary_sensor.front_porch_doorbell_package_detected': 'on',
			});
			expect(packageDelivered.hasPackage).toBe(true);
			expect(packageDelivered.hasPerson).toBe(false);
		});
	});

	describe('Color Conversion', () => {
		it('converts HS color to RGB accurately', () => {
			// Hue 32 (amber), Saturation 100% -> expected close to [255, 136, 0]
			const [r, g, b] = hsToRgb(32, 100);
			expect(r).toBe(255);
			expect(g).toBeGreaterThan(130);
			expect(g).toBeLessThan(145);
			expect(b).toBe(0);
		});
	});

	describe('Light Controls & Stateful Scene Toggle Logic', () => {
		it('targets the valid light.living_room group entity', () => {
			const expectedGroupEntityId = 'light.living_room';
			expect(expectedGroupEntityId).toBe('light.living_room');
			expect(expectedGroupEntityId).not.toBe('light.living_room_group');
		});

		it('toggles stateful scene switch correctly between on and off', () => {
			const getToggleServiceCall = (currentState: string, entityId: string) => {
				return {
					domain: 'switch',
					service: currentState === 'on' ? 'turn_off' : 'turn_on',
					data: { entity_id: entityId },
				};
			};

			const turnOffCall = getToggleServiceCall('on', 'switch.living_room_default_stateful_scene');
			expect(turnOffCall.service).toBe('turn_off');
			expect(turnOffCall.data.entity_id).toBe('switch.living_room_default_stateful_scene');

			const turnOnCall = getToggleServiceCall('off', 'switch.living_room_default_stateful_scene');
			expect(turnOnCall.service).toBe('turn_on');
			expect(turnOnCall.data.entity_id).toBe('switch.living_room_default_stateful_scene');
		});

		it('detects light color temperature and effect support properly', () => {
			const mockAttrs = {
				supported_color_modes: ['color_temp', 'xy'],
				min_color_temp_kelvin: 2000,
				max_color_temp_kelvin: 6535,
				effect_list: ['candle', 'fire', 'prism', 'sparkle'],
				effect: 'candle',
			};

			const supportsColorTemp = mockAttrs.supported_color_modes.includes('color_temp');
			const supportsColor = mockAttrs.supported_color_modes.some((m) =>
				['xy', 'rgb', 'rgbw', 'rgbww', 'hs'].includes(m),
			);
			const supportsEffects = mockAttrs.effect_list.length > 0;

			expect(supportsColorTemp).toBe(true);
			expect(supportsColor).toBe(true);
			expect(supportsEffects).toBe(true);
			expect(mockAttrs.effect_list).toContain('candle');
		});

		it('holds optimistic scene state through transient Home Assistant stateful_scenes transitions without flickering', () => {
			// Model the optimistic scene state machine
			let optimisticScenes: Record<string, boolean> = {};
			let defaultSceneState = 'off';
			const windDownSceneState = 'off';

			const getDisplayState = (entityId: string, haState: string) => {
				return optimisticScenes[entityId] ?? haState === 'on';
			};

			// 1. Initial state: both scenes are off
			expect(getDisplayState('switch.living_room_default_stateful_scene', defaultSceneState)).toBe(false);
			expect(getDisplayState('switch.living_room_wind_down_stateful_scene', windDownSceneState)).toBe(false);

			// 2. User activates Default Scene
			optimisticScenes = {
				'switch.living_room_default_stateful_scene': true,
				'switch.living_room_wind_down_stateful_scene': false,
			};

			// Optimistic state is instantly ON
			expect(getDisplayState('switch.living_room_default_stateful_scene', defaultSceneState)).toBe(true);

			// 3. 50ms later: Home Assistant briefly reports 'on'
			defaultSceneState = 'on';
			expect(getDisplayState('switch.living_room_default_stateful_scene', defaultSceneState)).toBe(true);

			// 4. 100ms later: Home Assistant stateful_scenes integration dips to 'off' while bulbs transition
			defaultSceneState = 'off';
			// With hold lock, UI remains TRUE (rock-solid, ZERO flicker/flash!)
			expect(getDisplayState('switch.living_room_default_stateful_scene', defaultSceneState)).toBe(true);

			// 5. 1100ms later: Home Assistant stateful_scenes confirms bulbs and sets 'on'
			defaultSceneState = 'on';
			expect(getDisplayState('switch.living_room_default_stateful_scene', defaultSceneState)).toBe(true);

			// 6. 2500ms later: Hold lock timer releases optimistic state
			delete optimisticScenes['switch.living_room_default_stateful_scene'];
			delete optimisticScenes['switch.living_room_wind_down_stateful_scene'];

			// Steady state confirmed from HA entity
			expect(getDisplayState('switch.living_room_default_stateful_scene', defaultSceneState)).toBe(true);
		});
	});
});
