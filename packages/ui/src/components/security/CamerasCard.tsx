/**
 * The cameras card: a snapshot of every camera, each opening its live view.
 *
 * @module
 */

import { Cctv } from 'lucide-react';
import type React from 'preact/compat';
import { useState } from 'preact/compat';
import { useHassSelector } from '../../context/HassContext';
import { CAMERAS_WATCH, discoverCameras } from '../../lib/cameras';
import { cn } from '../../lib/utils';
import { CameraModal, CameraThumbnail } from '../camera';
import { Button, Card } from '../ui';

const ALL = 'all';

/**
 * Every camera at a glance: a near-live snapshot each (a new frame every 5s while in view, blurred
 * under "Updating…" when out of date), detections marked; tap one for its live view, or View all for
 * every camera: `onViewAll` (the Home dashboard's Cameras view on phones), else the camera viewer.
 * Discovered, so a new camera appears on its own; nothing without any.
 */
export const CamerasCard: React.FC<{ compact?: boolean; onViewAll?: () => void }> = ({
	compact = false,
	onViewAll,
}) => {
	const cameras = useHassSelector((hass) => (hass ? discoverCameras(hass.states) : []), { watch: CAMERAS_WATCH });
	// The camera the viewer opens on; 'all' = its first, from View all
	const [selected, setSelected] = useState<string | null>(null);

	if (cameras.length === 0) return null;

	return (
		<Card className={cn('shrink-0 gap-3', compact ? 'gap-2 p-3' : 'p-4')}>
			<div className="flex items-center gap-2">
				<Cctv className="size-5 text-muted-foreground" />
				<span className="min-w-0 flex-1 truncate font-semibold">Cameras</span>
				<Button variant="outline" size="sm" onClick={onViewAll ?? (() => setSelected(ALL))}>
					View all
				</Button>
			</div>
			<div className={cn('grid gap-3', cameras.length > 1 && 'grid-cols-2', compact && 'gap-2')}>
				{cameras.map((camera) => (
					<CameraThumbnail key={camera.id} camera={camera} dim={false} onSelect={() => setSelected(camera.entityId)} />
				))}
			</div>
			{/* Keyed so every open starts on the tapped camera */}
			<CameraModal
				key={selected ?? 'closed'}
				isOpen={!!selected}
				initialCamera={selected && selected !== ALL ? selected : undefined}
				onClose={() => setSelected(null)}
			/>
		</Card>
	);
};
