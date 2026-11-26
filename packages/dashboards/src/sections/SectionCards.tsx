/**
 * The section cards: the dashboards' parts as cards of their own, for Home Assistant's sections view
 * (or any view), among any other cards. Each is registered by `cards.ts`.
 *
 * @module
 */

import { ClimateSection } from '@app/ui/climate';
import { EmptyState } from '@app/ui/components';
import { PanelHeader } from '@app/ui/header';
import { IntercomDialog } from '@app/ui/intercom';
import { type ModuleId, moduleById } from '@app/ui/lib/modules';
import { LightingSection } from '@app/ui/lighting';
import { useModuleState } from '@app/ui/modules';
import type { PanelComponentProps } from '@app/ui/panel';
import { CamerasCard, SecuritySection } from '@app/ui/security';
import { Puzzle } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState } from 'preact/compat';
import { PhoneHeader } from '../home/PhoneHeader';
import { MusicView } from '../home/views/MusicView';
import { lightingCardOptions, securityCardOptions } from './options';

/** The width the wide header needs (the wall panels' own, with its compact steps below 1280px). */
export const WIDE_HEADER_PX = 1000;

/**
 * A card's content while its module is on; otherwise a line saying why it's empty (the house hasn't
 * what it needs, or the house settings turned it off), so a card added in Home Assistant's editor
 * never just shows nothing.
 */
const ModuleCard: React.FC<{ id: ModuleId; children: React.ReactNode }> = ({ id, children }) => {
	const state = useModuleState(id);
	if (state === 'on') return <>{children}</>;
	const { name, needs } = moduleById(id);
	return (
		<EmptyState icon={<Puzzle className="size-10" />} className="rounded-xl border bg-card">
			{state === 'off' ? `${name} is turned off in the house settings` : `${name} needs ${lowerFirst(needs)}`}
		</EmptyState>
	);
};

const lowerFirst = (text: string) => (/^[A-Z][a-z]/.test(text) ? text[0]?.toLowerCase() + text.slice(1) : text);

/** An element's width, kept up to date (0 until it's laid out). */
function useWidth(el: HTMLElement | null): number {
	const [width, setWidth] = useState(0);
	useEffect(() => {
		if (!el) return;
		const observer = new ResizeObserver(() => setWidth(el.offsetWidth));
		observer.observe(el);
		return () => observer.disconnect();
	}, [el]);
	return width;
}

/**
 * The header: the wall panels' own where the card is wide enough (a section spanning the view), the
 * phone's otherwise, with Messages' dialog. Home Assistant's toolbar and sidebar stay as they are.
 */
export const HeaderCard: React.FC<PanelComponentProps> = () => {
	const [el, setEl] = useState<HTMLElement | null>(null);
	const width = useWidth(el);
	const [intercomOpen, setIntercomOpen] = useState(false);
	return (
		<div ref={setEl} className="w-full">
			{width >= WIDE_HEADER_PX ? (
				<PanelHeader greeting tvRemote colorSchemePicker />
			) : (
				<div className="overflow-hidden rounded-xl border">
					<PhoneHeader onIntercom={() => setIntercomOpen(true)} sidebarButton={false} />
					<IntercomDialog isOpen={intercomOpen} onClose={() => setIntercomOpen(false)} />
				</div>
			)}
		</div>
	);
};

/** Every light and scene by floor and room (`floor`: its own first, else every floor, top first). */
export const LightingCard: React.FC<PanelComponentProps> = ({ config }) => {
	const { title, floor } = lightingCardOptions(config);
	return (
		<ModuleCard id="lighting">
			<LightingSection title={title} floor={floor} allFloors={!floor} pageScroll />
		</ModuleCard>
	);
};

/** The alarm, locks with their doors, garage doors and (unless `cameras: false`) the cameras. */
export const SecurityCard: React.FC<PanelComponentProps> = ({ config }) => {
	const { cameras } = securityCardOptions(config);
	return (
		<ModuleCard id="security">
			<SecuritySection compact cameras={cameras} />
		</ModuleCard>
	);
};

/** The thermostats, then the scent diffusers, curtains and blinds, and fans. */
export const ClimateCard: React.FC<PanelComponentProps> = () => (
	<ModuleCard id="climate">
		<ClimateSection />
	</ModuleCard>
);

/** Music Assistant: now playing, browse, the queue and the speakers. */
export const MusicCard: React.FC<PanelComponentProps> = () => (
	<ModuleCard id="music">
		<MusicView />
	</ModuleCard>
);

/** Every camera's snapshot, each opening its live view. */
export const CamerasSectionCard: React.FC<PanelComponentProps> = () => (
	<ModuleCard id="cameras">
		<CamerasCard />
	</ModuleCard>
);
