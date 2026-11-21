import { ClimateSection } from '@app/ui/climate';
import { PanelLayout } from '@app/ui/layout';
import { LightingSection } from '@app/ui/lighting';
import { SecuritySection } from '@app/ui/security';
import type React from 'preact/compat';
import { PanelTimerAction } from './PanelTimer';

/** The card's options (its YAML, beside `type: custom:wall-panel-dashboard`). */
export interface WallPanelOptions {
	/** The panel's floor (a floor id): its lights and scenes listed first, then the nearest floors'. */
	floor?: string;
	/** A countdown timer in the header (a kitchen's), announced on the house's speaker when done. */
	timer: boolean;
}

/** The card's options, from its YAML (anything else ignored). */
export function wallPanelOptions(config: Record<string, unknown> | undefined): WallPanelOptions {
	return {
		floor: typeof config?.floor === 'string' && config.floor.trim() ? config.floor.trim() : undefined,
		timer: config?.timer === true,
	};
}

/**
 * A wall panel (a shared tablet on a wall): every light in the house by floor and room (its own
 * floor first), security and climate in three columns that fit the screen, under the shared header.
 */
export const WallPanel: React.FC<{ config?: Record<string, unknown> }> = ({ config }) => {
	const { floor, timer } = wallPanelOptions(config);
	return (
		<PanelLayout actions={timer ? <PanelTimerAction /> : undefined}>
			<main className="grid min-h-0 flex-1 grid-cols-3 grid-rows-1 gap-4 *:min-w-0 max-lg:gap-3">
				<LightingSection title="Lighting" subtitle="Every light in the house" floor={floor} />
				<SecuritySection />
				<ClimateSection />
			</main>
		</PanelLayout>
	);
};
