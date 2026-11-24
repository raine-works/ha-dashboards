/**
 * The page every dashboard sits in: the shared header over the panel's own content, with the
 * alerts and Party mode overlays.
 *
 * @module
 */

import type React from 'preact/compat';
import { useWallPanel } from '../../context/WallPanel';
import { PanelAlerts } from '../alerts/PanelAlerts';
import { PanelHeader } from '../header/PanelHeader';
import { PartyModeHost } from '../music/PartyModeHost';

export { ErrorBoundary, withErrorBoundary } from './ErrorBoundary';
export { Section, SectionGroup } from './Section';
export { SectionHeader } from './SectionHeader';

/** What a dashboard puts in the shared layout: its content, header extras, and which overlays it mounts. */
export interface PanelLayoutProps {
	/** Panel-specific header buttons (e.g. the kitchen timer). */
	actions?: React.ReactNode;
	/** The TV dialog's Remote tab (the Home dashboard; the wall panels leave it out). */
	tvRemote?: boolean;
	/** The greeting above the date ("Good evening, Alex"): the Home dashboard only. */
	greeting?: boolean;
	/** A button opening Home Assistant's sidebar in the header (the Home dashboard, which hides HA's toolbar). */
	sidebarButton?: boolean;
	/** This device's Light / Dark / Auto in the header's ⋯ menu (the Home dashboard; the wall panels stay dark). */
	colorSchemePicker?: boolean;
	/** The panel's own content, under the shared header; fills the remaining height. */
	children: React.ReactNode;
	/**
	 * Mount the toasts and doorbell live view here (default). The Home dashboard mounts them once
	 * above its layouts instead, so they survive switching layouts (a tablet turning).
	 */
	alerts?: boolean;
}

/**
 * Every wall panel: full-height page with the shared header (clock, weather, open doors,
 * cameras, intercom, people, pets) and the alerts/doorbell overlay. Tighter on 10.5" panels.
 */
export const PanelLayout: React.FC<PanelLayoutProps> = ({
	actions,
	children,
	alerts = true,
	tvRemote,
	greeting,
	sidebarButton,
	colorSchemePicker,
}) => {
	const wallPanel = useWallPanel();
	return (
		<div className="relative box-border flex size-full max-h-full min-h-0 flex-1 flex-col gap-4 overflow-hidden bg-background p-5 font-sans text-foreground max-lg:gap-3 max-lg:p-3">
			<PanelHeader
				actions={actions}
				tvRemote={tvRemote}
				greeting={greeting}
				sidebarButton={sidebarButton}
				colorSchemePicker={colorSchemePicker}
			/>
			{children}
			{/* Bottom-left toasts (doors/windows, doorbell) and the doorbell live view */}
			{/* Out of the flow (its toasts and dialogs are fixed), so the column gap never leaves an empty strip at the bottom */}
			{alerts && (
				<div className="absolute size-0">
					<PanelAlerts />
				</div>
			)}
			{/* The wall panels' full-screen music view, opened from the music dialog */}
			{wallPanel && <PartyModeHost />}
		</div>
	);
};
