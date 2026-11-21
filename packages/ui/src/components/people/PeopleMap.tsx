import L from 'leaflet';
import type React from 'preact/compat';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/compat';
import { type ColorScheme, useColorScheme } from '../../context/ColorScheme';
import { dragZoom, isSecondTap, isTap, TAP_SLOP_PX, type TapPoint } from '../../lib/map-zoom';
import { groupNearby, type PersonView } from '../../lib/people';
import { cn } from '../../lib/utils';

export interface MapZone {
	entityId: string;
	latitude: number;
	longitude: number;
	/** Meters */
	radius: number;
}

export interface PeopleMapProps {
	people: (PersonView & { latitude: number; longitude: number })[];
	zones: MapZone[];
	/** Person to center on; null shows everyone. */
	focus: string | null;
	className?: string;
}

// Esri's street map (no API key; labeled streets up to zoom 19). Both modes show it in gray, and dark
// mode inverted and dimmed (`.leaflet-tiles-*` in theme.css), darker than Esri's dark gray canvas
const TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
const ATTRIBUTION = 'Esri, HERE, Garmin, USGS, &copy; OpenStreetMap contributors';
const MAX_TILE_ZOOM = 19;
const TILE_CLASS: Record<ColorScheme, string> = { dark: 'leaflet-tiles-dark', light: 'leaflet-tiles-light' };

// Close enough to see the street when everyone is in one place
const MAX_FIT_ZOOM = 15;

const escapeHtml = (s: string) =>
	s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

type Located = PeopleMapProps['people'][number];

// Avatars this close on screen (px, about one avatar) would overlap: they become one marker
const GROUP_RADIUS_PX = 40;
// A group shows this many faces, then "+N"
const GROUP_FACES = 3;
// Grouped faces: 40px, each overlapping the one before by 12px
const GROUP_FACE_PX = 40;
const GROUP_STEP_PX = 28;

/** Home green, another zone blue, away outlined: the ring (and the dot in a group's list). */
const ringOf = (person: PersonView) =>
	person.isHome ? 'border-success' : person.zone ? 'border-info' : 'border-foreground';
const dotOf = (person: PersonView) => (person.isHome ? 'bg-success' : person.zone ? 'bg-info' : 'bg-foreground');

const faceOf = (person: PersonView) =>
	person.picture
		? `<img src="${escapeHtml(person.picture)}" alt="" class="size-full object-cover" />`
		: `<span class="flex size-full items-center justify-center bg-muted font-semibold text-foreground text-sm">${escapeHtml(person.initials)}</span>`;

function avatarIcon(person: PersonView): L.DivIcon {
	return L.divIcon({
		className: '', // drop Leaflet's white leaflet-div-icon box
		iconSize: [44, 44],
		iconAnchor: [22, 22],
		html: `<div class="size-11 overflow-hidden rounded-full border-3 shadow-lg ${ringOf(person)}">${faceOf(person)}</div>`,
	});
}

/**
 * People in about the same place: their faces stacked (up to three, then "+N"), centered on the
 * spot, with a card beside them naming everyone there (a dot each in their ring's color).
 */
function groupIcon(group: PersonView[]): L.DivIcon {
	const shown = group.slice(0, GROUP_FACES);
	const extra = group.length - shown.length;
	const faces = shown
		.map(
			(p) =>
				`<div class="size-10 shrink-0 overflow-hidden rounded-full border-3 bg-muted shadow-md ${ringOf(p)}">${faceOf(p)}</div>`,
		)
		.join('');
	const more =
		extra > 0
			? `<div class="flex size-10 shrink-0 items-center justify-center rounded-full border-3 border-background bg-muted font-semibold text-foreground text-xs shadow-md">+${extra}</div>`
			: '';
	const names = group
		.map(
			(p) =>
				`<li class="flex items-center gap-1.5"><span class="size-2 shrink-0 rounded-full ${dotOf(p)}"></span>${escapeHtml(p.shortName)}</li>`,
		)
		.join('');
	const width = GROUP_FACE_PX + (shown.length - 1 + (extra > 0 ? 1 : 0)) * GROUP_STEP_PX;
	return L.divIcon({
		className: '',
		iconSize: [width, GROUP_FACE_PX],
		iconAnchor: [width / 2, GROUP_FACE_PX / 2],
		html: `<div class="relative flex h-10 cursor-pointer -space-x-3">${faces}${more}<ul class="absolute top-1/2 left-full ml-2 flex -translate-y-1/2 flex-col gap-0.5 whitespace-nowrap rounded-md border bg-popover px-2 py-1.5 font-medium text-popover-foreground text-xs shadow-md">${names}</ul></div>`,
	});
}

/** The parts of Leaflet's map its own pinch handler drives (TouchZoom), used the same way here. */
interface ZoomableMap extends L.Map {
	_moveStart(zoomChanged: boolean, noMoveStart: boolean): this;
	_move(center: L.LatLng, zoom: number, data?: { pinch?: boolean; round?: boolean }): this;
	_moveEnd(zoomChanged: boolean): this;
	_animateZoom(center: L.LatLng, zoom: number, startAnim: boolean, noUpdate: boolean): void;
	_limitZoom(zoom: number): number;
}

/**
 * One-handed zoom, as in Google Maps: tap, then touch again and hold, and drag down to zoom in or
 * up to zoom out, about the spot touched (it stays under the finger). Touch and pen only. A plain
 * double tap is left to Leaflet (zooms in a level). The map is moved the way Leaflet's own pinch
 * does it: scaled live, then settled on the nearest zoom step. Returns its cleanup.
 */
function enableDoubleTapDragZoom(map: L.Map, container: HTMLElement): () => void {
	const zoomable = map as ZoomableMap;
	let down: (TapPoint & { id: number }) | null = null;
	let lastTap: TapPoint | null = null;
	let hold: { id: number; startY: number; startZoom: number; point: L.Point; latLng: L.LatLng } | null = null;
	let zooming = false;
	let frame = 0;
	let target: { center: L.LatLng; zoom: number } | null = null;

	const pointOf = (e: PointerEvent): TapPoint => ({ x: e.clientX, y: e.clientY, time: e.timeStamp });

	const end = (settle: boolean) => {
		if (!hold) return;
		hold = null;
		cancelAnimationFrame(frame);
		map.dragging.enable();
		if (!zooming) return;
		zooming = false;
		const at = target;
		target = null;
		if (!at || !settle) {
			zoomable._moveEnd(true);
			return;
		}
		// Glide to the nearest zoom step, like the end of a pinch
		zoomable._animateZoom(at.center, zoomable._limitZoom(at.zoom), true, true);
	};

	// Capture: before Leaflet's own drag handler, which would pan with the second touch
	const onDown = (e: PointerEvent) => {
		if (e.pointerType === 'mouse') return;
		// A second finger: this is a pinch, Leaflet's
		if (down || hold) {
			end(false);
			down = null;
			lastTap = null;
			return;
		}
		const at = pointOf(e);
		if (isSecondTap(lastTap, at)) {
			lastTap = null;
			const point = map.mouseEventToContainerPoint(e);
			hold = {
				id: e.pointerId,
				startY: e.clientY,
				startZoom: map.getZoom(),
				point,
				latLng: map.containerPointToLatLng(point),
			};
			map.dragging.disable();
			return;
		}
		down = { ...at, id: e.pointerId };
	};

	const onMove = (e: PointerEvent) => {
		if (!hold || e.pointerId !== hold.id) return;
		const dy = e.clientY - hold.startY;
		if (!zooming && Math.abs(dy) < TAP_SLOP_PX) return;
		const zoom = dragZoom(hold.startZoom, dy, map.getMinZoom(), map.getMaxZoom());
		// Keep the touched spot where it was on screen
		const offset = hold.point.subtract(map.getSize().divideBy(2));
		const center = map.unproject(map.project(hold.latLng, zoom).subtract(offset), zoom);
		if (!zooming) {
			zooming = true;
			map.stop();
			zoomable._moveStart(true, false);
		}
		target = { center, zoom };
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => zoomable._move(center, zoom, { pinch: true, round: false }));
		e.preventDefault();
	};

	const onUp = (e: PointerEvent) => {
		if (hold && e.pointerId === hold.id) {
			end(true);
			return;
		}
		if (down && e.pointerId === down.id) {
			lastTap = isTap(down, pointOf(e)) ? pointOf(e) : null;
			down = null;
		}
	};

	const onCancel = (e: PointerEvent) => {
		if (hold && e.pointerId === hold.id) end(true);
		if (down && e.pointerId === down.id) down = null;
	};

	container.addEventListener('pointerdown', onDown, true);
	window.addEventListener('pointermove', onMove, { passive: false });
	window.addEventListener('pointerup', onUp);
	window.addEventListener('pointercancel', onCancel);
	return () => {
		end(false);
		container.removeEventListener('pointerdown', onDown, true);
		window.removeEventListener('pointermove', onMove);
		window.removeEventListener('pointerup', onUp);
		window.removeEventListener('pointercancel', onCancel);
	};
}

/** Leaflet map of everyone's last position, fitted so they're all in frame. */
export const PeopleMap: React.FC<PeopleMapProps> = ({ people, zones, focus, className }) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<L.Map | null>(null);
	const markersRef = useRef<L.LayerGroup | null>(null);
	const zonesRef = useRef<L.LayerGroup | null>(null);
	// Frames everyone (or the focused person); set below, also called once the container has a size
	const frameRef = useRef<() => void>(() => {});
	const scheme = useColorScheme();
	const tilesRef = useRef<L.LayerGroup | null>(null);
	// The map's zoom: who overlaps (and is grouped) depends on it
	const [zoom, setZoom] = useState<number | undefined>(undefined);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const map = L.map(container, {
			zoomControl: false,
			attributionControl: false,
			maxZoom: MAX_TILE_ZOOM,
			// Half steps frame everyone more tightly than whole zoom levels
			zoomSnap: 0.5,
		});
		L.control.attribution({ prefix: false }).addTo(map);
		tilesRef.current = L.layerGroup().addTo(map);
		zonesRef.current = L.layerGroup().addTo(map);
		markersRef.current = L.layerGroup().addTo(map);
		mapRef.current = map;
		map.on('zoomend', () => setZoom(map.getZoom()));
		const stopDragZoom = enableDoubleTapDragZoom(map, container);

		// The dialog sizes the container after mount (and may resize it): re-frame until someone
		// pans or zooms, so the first frame isn't computed for a smaller box
		let touched = false;
		const onTouch = () => {
			touched = true;
		};
		container.addEventListener('pointerdown', onTouch);
		container.addEventListener('wheel', onTouch, { passive: true });
		const observer = new ResizeObserver(() => {
			map.invalidateSize();
			if (!touched && container.clientWidth > 0 && container.clientHeight > 0) frameRef.current();
		});
		observer.observe(container);
		return () => {
			observer.disconnect();
			stopDragZoom();
			container.removeEventListener('pointerdown', onTouch);
			container.removeEventListener('wheel', onTouch);
			map.remove();
			mapRef.current = null;
		};
	}, []);

	// Basemap for the current mode (swapped in place when the mode changes)
	useEffect(() => {
		const tiles = tilesRef.current;
		if (!tiles) return;
		tiles.clearLayers();
		tiles.addLayer(
			L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: MAX_TILE_ZOOM, className: TILE_CLASS[scheme] }),
		);
	}, [scheme]);

	useEffect(() => {
		const layer = zonesRef.current;
		if (!layer) return;
		layer.clearLayers();
		for (const zone of zones) {
			L.circle([zone.latitude, zone.longitude], {
				radius: zone.radius,
				className: cn('leaflet-zone', zone.entityId === 'zone.home' && 'leaflet-zone-home'),
				weight: 1,
				fillOpacity: 0.15,
				interactive: false,
			}).addTo(layer);
		}
	}, [zones]);

	// One marker per person, or per group of people whose avatars would overlap at this zoom
	useEffect(() => {
		const map = mapRef.current;
		const layer = markersRef.current;
		if (!map || !layer) return;
		layer.clearLayers();
		const at = zoom ?? MAX_FIT_ZOOM;
		const groups = groupNearby(people, (p: Located) => map.project([p.latitude, p.longitude], at), GROUP_RADIUS_PX);
		for (const group of groups) {
			if (group.length === 1) {
				const [person] = group;
				L.marker([person.latitude, person.longitude], {
					icon: avatarIcon(person),
					title: person.name,
					keyboard: false,
					// Away people on top of the pile at home
					zIndexOffset: person.isHome ? 0 : 100,
				}).addTo(layer);
				continue;
			}
			const bounds = L.latLngBounds(group.map((p) => [p.latitude, p.longitude]));
			L.marker(bounds.getCenter(), {
				icon: groupIcon(group),
				title: group.map((p) => p.name).join(', '),
				keyboard: false,
				zIndexOffset: 200,
			})
				// Tap to zoom in until they part (people at the very same spot stay together)
				.on('click', () => {
					if (!bounds.getNorthEast().equals(bounds.getSouthWest()))
						map.flyToBounds(bounds, { padding: [72, 72], maxZoom: MAX_TILE_ZOOM, duration: 0.6 });
				})
				.addTo(layer);
		}
	}, [people, zoom]);

	// Re-frame only when the focus or who is on the map changes, not on every position update,
	// so live updates don't fight a pan or pinch.
	const peopleKey = people.map((p) => p.entityId).join(',');
	// Kept current after every render (never written during one, which the React Compiler refuses),
	// before the effects below and the container's resize observer call it
	useLayoutEffect(() => {
		frameRef.current = () => {
			const map = mapRef.current;
			if (!map || people.length === 0) return;
			const focused = focus ? people.find((p) => p.entityId === focus) : undefined;
			if (focused) {
				map.flyTo([focused.latitude, focused.longitude], MAX_FIT_ZOOM, { duration: 0.6 });
				return;
			}
			const bounds = L.latLngBounds(people.map((p) => [p.latitude, p.longitude]));
			// Animate only once a view exists (the first frame just sets it)
			map.fitBounds(bounds, { padding: [48, 48], maxZoom: MAX_FIT_ZOOM, animate: map.getZoom() !== undefined });
		};
	});
	useEffect(() => frameRef.current(), [focus, peopleKey]);

	return <div ref={containerRef} className={cn('isolate z-0 overflow-hidden rounded-lg border', className)} />;
};
