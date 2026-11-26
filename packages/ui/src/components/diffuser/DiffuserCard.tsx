/**
 * Scent diffusers: a DeviceRow each (on or off and the fragrance, the oil only when it's low, Quick
 * scent), in the Climate section's Scent group.
 *
 * @module
 */

import { Loader2, SprayCan } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useLayoutEffect, useState } from 'preact/compat';
import { useHassApi, useHassSelector } from '../../context/HassContext';
import { useBusy } from '../../hooks/useBusy';
import {
	DIFFUSERS_WATCH,
	type Diffuser,
	diffuserEntities,
	discoverDiffusers,
	formatScentLeft,
	getDiffuserView,
	type PressSeen,
	quickScentUntil,
} from '../../lib/diffusers';
import { pickStates } from '../../lib/hass-store';
import { cn } from '../../lib/utils';
import { SectionGroup } from '../layout/Section';
import { Button, DeviceRow, StableLabel, toast } from '../ui';

/** The quick scent's time left, ticking every second: a leaf of its own, so only it re-renders. */
const ScentCountdown: React.FC<{ until: number }> = ({ until }) => {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [until]);
	return <span className="tabular-nums">{formatScentLeft(until - now)}</span>;
};

/**
 * One diffuser as a DeviceRow: its icon tile (the neutral "on" while on, the spray can pulsing while it
 * diffuses), its name, and one line: On or Off (so the away automation can be seen working) and the
 * fragrance, or "Oil low" in amber (EverScent reports no amount); Quick scent at the end, busy for as
 * long as the quick scent runs.
 */
export const DiffuserRow: React.FC<{ diffuser: Diffuser; className?: string }> = ({ diffuser, className }) => {
	const { callService, waitFor } = useHassApi();
	const ids = new Set(diffuserEntities(diffuser));
	const states = useHassSelector((hass) => pickStates(hass?.states, (id) => ids.has(id)), {
		watch: (id) => ids.has(id),
	});
	// A press that arrives while the row is shown (its button's state moving on from the one it mounted
	// with) is timed from its arrival on this device's clock, not Home Assistant's (`quickScentUntil`).
	// Before paint, so the countdown never shows the other clock's reading first
	const pressed = states[diffuser.quickScent]?.state;
	const [mountedWith] = useState(pressed);
	const [seen, setSeen] = useState<PressSeen | null>(null);
	useLayoutEffect(() => {
		if (pressed && pressed !== mountedWith) setSeen({ pressed, at: Date.now() });
	}, [pressed]);
	// Re-read at the quick scent's end: one timer at the deadline, not a ticking clock
	const until = quickScentUntil(diffuser, states, seen);
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (until == null) return;
		const left = until - Date.now();
		setNow(Date.now());
		if (left <= 0) return;
		const timer = setTimeout(() => setNow(Date.now()), left + 50);
		return () => clearTimeout(timer);
	}, [until]);
	const view = getDiffuserView(diffuser, states, now, seen);
	const on = view.status === 'on';
	const busy = useBusy();
	const { name } = diffuser;

	// Busy until the button's last-pressed state moves (the press went through), then a toast
	const quickScent = () => {
		const before = states[diffuser.quickScent]?.state;
		busy.run('scent', () =>
			callService('button', 'press', { entity_id: diffuser.quickScent }, { errors: 'throw' })
				.then(() => waitFor((hass) => hass.states[diffuser.quickScent]?.state !== before))
				.then(() => toast.success('Quick scent on the way', { description: name }))
				.catch(() => toast.error("Couldn't start a quick scent", { description: name })),
		);
	};

	// One line (docs/design/components.md): on or off and the fragrance, the oil only when it's low
	const status = [view.low ? 'Oil low' : view.label, view.fragrance].filter(Boolean).join(' · ');
	return (
		<DeviceRow
			icon={<SprayCan className={cn(view.scenting && 'animate-pulse')} />}
			tone={on ? 'on' : 'off'}
			name={name}
			status={status}
			statusTone={view.low ? 'warning' : undefined}
			className={className}
			trailing={
				<Button
					variant="secondary"
					size="md"
					onClick={quickScent}
					disabled={!view.canQuickScent || view.quickScenting}
					loading={busy.isBusy('scent')}
				>
					{/* While it runs, a spinner in the icon's place and the time left, in the label's width */}
					{view.quickScenting ? <Loader2 className="animate-spin" /> : <SprayCan />}
					<StableLabel
						options={['Quick scent', until != null && view.quickScenting ? <ScentCountdown until={until} /> : '']}
						value={view.quickScenting ? 1 : 0}
					/>
				</Button>
			}
		/>
	);
};

/** Every EverScent diffuser (discovered) in the Scent group, a row each. Nothing when there are none. */
export const DiffusersCard: React.FC<{ className?: string }> = ({ className }) => {
	const diffusers = useHassSelector((hass) => (hass ? discoverDiffusers(hass, hass.states) : []), {
		watch: DIFFUSERS_WATCH,
	});
	if (diffusers.length === 0) return null;

	return (
		<SectionGroup label="Scent" surface className={className}>
			{diffusers.map((diffuser) => (
				<DiffuserRow key={diffuser.power} diffuser={diffuser} />
			))}
		</SectionGroup>
	);
};
