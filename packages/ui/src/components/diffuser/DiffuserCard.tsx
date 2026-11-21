import { Droplet, Loader2, SprayCan } from 'lucide-react';
import type React from 'preact/compat';
import { Fragment, useEffect, useState } from 'preact/compat';
import { useHassApi, useHassSelector } from '../../context/HassContext';
import { useBusy } from '../../hooks/useBusy';
import {
	DIFFUSERS_WATCH,
	type Diffuser,
	diffuserEntities,
	discoverDiffusers,
	formatScentLeft,
	getDiffuserView,
	quickScentUntil,
} from '../../lib/diffusers';
import { pickStates } from '../../lib/hass-store';
import { cn } from '../../lib/utils';
import { Button, Card, CardDescription, CardHeader, CardTitle, Separator, StableLabel, toast } from '../ui';

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
 * One diffuser: its tile (tinted while on, the spray can pulsing while it diffuses), its name and
 * status (a dot with On or Off, so the away automation can be seen working; display only), whether
 * the oil is low (EverScent reports no amount), the fragrance installed, and Quick scent, busy for
 * as long as the quick scent runs.
 */
export const DiffuserRow: React.FC<{ diffuser: Diffuser; className?: string }> = ({ diffuser, className }) => {
	const { callService, waitFor } = useHassApi();
	const ids = new Set(diffuserEntities(diffuser));
	const states = useHassSelector((hass) => pickStates(hass?.states, (id) => ids.has(id)), {
		watch: (id) => ids.has(id),
	});
	// Re-read at the quick scent's end: one timer at the deadline, not a ticking clock
	const until = quickScentUntil(diffuser, states);
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (until == null) return;
		const left = until - Date.now();
		setNow(Date.now());
		if (left <= 0) return;
		const timer = setTimeout(() => setNow(Date.now()), left + 50);
		return () => clearTimeout(timer);
	}, [until]);
	const view = getDiffuserView(diffuser, states, now);
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

	return (
		<div className={cn('flex flex-col gap-3 p-4', className)}>
			<div className="flex items-center gap-3.5">
				<div
					aria-hidden
					className={cn(
						'flex size-12 shrink-0 items-center justify-center rounded-lg transition-colors',
						on ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground',
					)}
				>
					<SprayCan size={22} className={cn(view.scenting && 'animate-pulse')} />
				</div>
				<div className="flex min-w-0 flex-1 items-start justify-between gap-3">
					<div className="flex min-w-0 flex-col">
						<span className="truncate font-semibold">{name}</span>
						<span className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-sm">
							<span
								aria-hidden
								className={cn('size-1.5 shrink-0 rounded-full', on ? 'bg-success' : 'bg-muted-foreground/40')}
							/>
							<span className="truncate">{view.label}</span>
						</span>
					</div>
				</div>
			</div>

			<div className="flex items-center justify-between gap-3 text-sm">
				<span className="flex items-center gap-1.5 text-muted-foreground">
					<Droplet className="size-4" />
					Oil
				</span>
				<span className={cn('font-medium', view.low ? 'text-warning' : 'text-success')}>
					{view.low ? 'Low · replace soon' : 'Good'}
				</span>
			</div>

			<div className="flex items-center gap-3">
				<div className="flex min-w-0 flex-1 flex-col">
					<span className="truncate font-medium">{view.fragrance ?? 'No fragrance'}</span>
					{view.category && <span className="truncate text-muted-foreground text-sm">{view.category}</span>}
				</div>
				<Button
					variant="outline"
					size="xl"
					onClick={quickScent}
					disabled={!view.canQuickScent || view.quickScenting}
					loading={busy.isBusy('scent')}
					className="shrink-0"
				>
					{/* While it runs, a spinner in the icon's place and the time left, in the label's width */}
					{view.quickScenting ? <Loader2 className="animate-spin" /> : <SprayCan />}
					<StableLabel
						options={['Quick scent', until != null && view.quickScenting ? <ScentCountdown until={until} /> : '']}
						value={view.quickScenting ? 1 : 0}
					/>
				</Button>
			</div>
		</div>
	);
};

/** Every EverScent diffuser (discovered) in one card, a row each. Nothing when there are none. */
export const DiffusersCard: React.FC<{ className?: string }> = ({ className }) => {
	const diffusers = useHassSelector((hass) => (hass ? discoverDiffusers(hass, hass.states) : []), {
		watch: DIFFUSERS_WATCH,
	});
	if (diffusers.length === 0) return null;

	return (
		<Card className={cn('gap-0 py-0', className)}>
			<CardHeader className="items-center gap-3 border-b px-4 py-3 [.border-b]:pb-3">
				<div className="flex min-w-0 items-center gap-3">
					<SprayCan className="size-5 shrink-0 text-info" />
					<div className="min-w-0">
						<CardTitle className="truncate text-lg">Scent</CardTitle>
						<CardDescription className="truncate">Whole-home diffuser</CardDescription>
					</div>
				</div>
			</CardHeader>
			{diffusers.map((diffuser, i) => (
				<Fragment key={diffuser.power}>
					{i > 0 && <Separator />}
					<DiffuserRow diffuser={diffuser} />
				</Fragment>
			))}
		</Card>
	);
};
