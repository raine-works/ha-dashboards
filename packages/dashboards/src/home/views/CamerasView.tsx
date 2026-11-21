import { CameraModal, CameraThumbnail } from '@app/ui/camera';
import { Button, EmptyState } from '@app/ui/components';
import { useHassSelector } from '@app/ui/hass';
import { CAMERAS_WATCH, discoverCameras } from '@app/ui/lib/cameras';
import { Cctv, ChevronLeft } from 'lucide-react';
import type React from 'preact/compat';
import { useState } from 'preact/compat';

/**
 * A snapshot tile per camera (a fresh frame 5s after the last, while in view); tap one for its live
 * view with talkback. Opened from Security's Cameras card, so `onBack` returns there.
 */
export const CamerasView: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
	const cameras = useHassSelector((hass) => (hass ? discoverCameras(hass.states) : []), {
		watch: CAMERAS_WATCH,
	});
	const [selected, setSelected] = useState<string | null>(null);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-3 px-2">
				{onBack && (
					<Button
						variant="outline"
						size="icon-sm"
						onClick={onBack}
						aria-label="Back to Security"
						title="Back to Security"
					>
						<ChevronLeft />
					</Button>
				)}
				<Cctv className="size-6 shrink-0 text-violet-600 dark:text-violet-400" />
				<div className="min-w-0">
					<h2 className="truncate font-semibold text-lg leading-tight">Cameras</h2>
					<p className="truncate text-muted-foreground text-sm">Tap a camera for live view and talkback</p>
				</div>
			</div>

			{cameras.length === 0 && <EmptyState icon={<Cctv className="size-10" />}>No cameras found.</EmptyState>}

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
				{cameras.map((camera) => (
					<CameraThumbnail
						key={camera.id}
						camera={camera}
						dim={false}
						onSelect={() => setSelected(camera.entityId)}
						className="rounded-xl"
					/>
				))}
			</div>

			{/* Keyed so every open starts on the tapped camera */}
			<CameraModal
				key={selected ?? 'closed'}
				isOpen={!!selected}
				initialCamera={selected ?? undefined}
				onClose={() => setSelected(null)}
			/>
		</div>
	);
};
