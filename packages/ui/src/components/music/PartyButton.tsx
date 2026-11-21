import { Cast, Check, Copy, Loader2, PartyPopper, RefreshCw, Share2, TriangleAlert, Tv } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState } from 'preact/compat';
import { useHassApi, useHassReady } from '../../context/HassContext';
import { useWallPanel } from '../../context/WallPanel';
import { castParty, getPartyLink, getPartyTvs, type PartyLink, type PartyTv } from '../../lib/music';
import { qrPath } from '../../lib/qr';
import { discoverTvs } from '../../lib/tv';
import { cn } from '../../lib/utils';
import {
	Alert,
	AlertDescription,
	AlertTitle,
	Button,
	type ButtonProps,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	StableLabel,
	SwitchRow,
	toast,
} from '../ui';

/** How long "Copied" shows after copying the link */
const COPIED_MS = 2000;

/** Dark modules on white, whatever the theme: what every phone camera reads */
export const QrCode: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
	const { size, path } = qrPath(text);
	return (
		<svg
			viewBox={`0 0 ${size} ${size}`}
			role="img"
			aria-label="QR code to join the party"
			shapeRendering="crispEdges"
			className={cn('aspect-square w-full max-w-72 short:max-w-40 rounded-xl bg-white', className)}
		>
			<path d={path} fill="#000" />
		</svg>
	);
};

/**
 * The Party plugin's guest link while `enabled` (`music_assistant.get_party_url`): loading, the link (whose
 * `url` is null while guest access is off or Music Assistant refused), or failed. `retry` asks again.
 */
export function usePartyLink(enabled: boolean) {
	const { getHass } = useHassApi();
	const ready = useHassReady();
	const [link, setLink] = useState<PartyLink | 'loading' | 'failed'>('loading');
	const [attempt, setAttempt] = useState(0);

	useEffect(() => {
		if (!enabled || !ready) return;
		const hass = getHass();
		if (!hass) return;
		let active = true;
		setLink('loading');
		getPartyLink(hass)
			.then((result) => active && setLink(result))
			.catch(() => active && setLink('failed'));
		return () => {
			active = false;
		};
	}, [enabled, ready, attempt]);

	return { link, url: typeof link === 'object' ? link.url : null, retry: () => setAttempt((n) => n + 1) };
}

/**
 * The Party Dashboard (lyrics and the join QR code) on TVs, through Music Assistant's own Chromecast
 * casting (its display media players): a switch per TV, showing which have
 * it now, and one button for every TV at once (each cast in parallel). Switches flip at once and
 * flip back with a toast if Music Assistant refuses.
 */
const PartyTvs: React.FC<{ open: boolean }> = ({ open }) => {
	const { getHass } = useHassApi();
	const ready = useHassReady();
	const [tvs, setTvs] = useState<PartyTv[] | 'loading' | 'failed'>('loading');
	// TVs a show or hide is on its way to
	const [busy, setBusy] = useState<string[]>([]);

	useEffect(() => {
		if (!open || !ready) return;
		const hass = getHass();
		if (!hass) return;
		let active = true;
		setTvs('loading');
		// Music Assistant's displays named as one of the house's TVs (it counts some receivers as displays)
		getPartyTvs(hass, new Set(discoverTvs(hass.states, hass).map((tv) => tv.name)))
			.then((list) => active && setTvs(list))
			.catch(() => active && setTvs('failed'));
		return () => {
			active = false;
		};
	}, [open, ready]);

	const setShowing = (ids: string[], showing: boolean) =>
		setTvs((prev) => (Array.isArray(prev) ? prev.map((tv) => (ids.includes(tv.id) ? { ...tv, showing } : tv)) : prev));

	const cast = (targets: PartyTv[], show: boolean) => {
		const hass = getHass();
		if (!hass || targets.length === 0) return;
		const ids = targets.map((tv) => tv.id);
		setShowing(ids, show);
		setBusy((prev) => [...prev, ...ids]);
		for (const tv of targets) {
			castParty(hass, tv.id, show)
				.catch((err) => {
					setShowing([tv.id], !show);
					toast.error(`Couldn't ${show ? 'cast to' : 'stop'} ${tv.name}`, { description: (err as Error).message });
				})
				.then(() => setBusy((prev) => prev.filter((id) => id !== tv.id)));
		}
	};

	if (tvs === 'failed') return null;
	const list = Array.isArray(tvs) ? tvs : [];
	const off = list.filter((tv) => !tv.showing);
	const on = list.filter((tv) => tv.showing);

	return (
		<section className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-2">
				<span className="flex items-center gap-2 font-medium text-sm">
					<Cast className="size-4 text-muted-foreground" />
					Show on TVs
				</span>
				{list.length > 1 &&
					(off.length > 0 ? (
						<Button variant="outline" size="sm" onClick={() => cast(off, true)}>
							All TVs
						</Button>
					) : (
						<Button variant="outline" size="sm" onClick={() => cast(on, false)}>
							Stop all
						</Button>
					))}
			</div>
			{tvs === 'loading' && (
				<p className="flex items-center gap-2 text-muted-foreground text-sm">
					<Loader2 className="size-4 animate-spin" />
					Finding TVs…
				</p>
			)}
			{Array.isArray(tvs) && list.length === 0 && (
				<p className="text-muted-foreground text-sm">Music Assistant hasn't found any Chromecast TVs.</p>
			)}
			{list.length > 0 && (
				<div className="flex flex-col divide-y rounded-lg border">
					{list.map((tv) => (
						<SwitchRow
							key={tv.id}
							checked={tv.showing}
							disabled={busy.includes(tv.id)}
							onCheckedChange={(show) => cast([tv], show)}
							aria-label={`Show the Party Dashboard on ${tv.name}`}
							className="px-3 py-2.5"
						>
							<Tv className="size-5 shrink-0 text-muted-foreground" />
							<span className="min-w-0 flex-1 truncate">{tv.name}</span>
							{busy.includes(tv.id) && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
						</SwitchRow>
					))}
				</div>
			)}
		</section>
	);
};

/**
 * Music Assistant's Party mode: guests scan the QR code (or open the shared link) to search for and
 * request songs, no login. The link comes from the Party plugin through Home Assistant
 * (`music_assistant.get_party_url`), lasts the plugin's Party Duration (8 hours by default), and is the
 * same link the Party Dashboard shows. On a phone or laptop it can be shared or copied too; and
 * the Party Dashboard itself (lyrics and the QR code) casts to any of the TVs (`PartyTvs`).
 */
export const PartyButton: React.FC<{ size?: ButtonProps['size'] }> = ({ size = 'sm' }) => {
	const wallPanel = useWallPanel();
	const [open, setOpen] = useState(false);
	const { link, url, retry } = usePartyLink(open);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), COPIED_MS);
		return () => clearTimeout(timer);
	}, [copied]);

	const canShare = !wallPanel && !!url && typeof navigator.share === 'function';

	return (
		<>
			<Button variant="outline" size={size} onClick={() => setOpen(true)} title="Let guests add songs">
				<PartyPopper />
				Party
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-sm:justify-center-safe sm:max-w-md">
					<DialogHeader className="items-center text-center sm:text-center">
						<DialogTitle>Party</DialogTitle>
						<DialogDescription>Guests scan to search for songs and add them to the queue</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col items-center gap-4">
						{link === 'loading' && (
							<div className="flex aspect-square w-full max-w-72 short:max-w-40 items-center justify-center rounded-xl bg-muted">
								<Loader2 className="size-8 animate-spin text-muted-foreground" />
							</div>
						)}
						{url && <QrCode text={url} />}
						{url && !wallPanel && <p className="w-full truncate text-center text-muted-foreground text-xs">{url}</p>}

						{typeof link === 'object' && !url && (
							<Alert variant="warning">
								<TriangleAlert />
								<AlertTitle>
									{link.status === 200 ? 'Guest access is off' : 'The Party link needs more of Music Assistant'}
								</AlertTitle>
								<AlertDescription>
									{link.status === 200
										? 'Turn on "Enable Guest Access via QR Code" in Music Assistant: Settings, Plugins, Party.'
										: 'Install raine-works/ha-music-assistant from HACS: it replaces the Music Assistant integration with one that has it.'}
								</AlertDescription>
							</Alert>
						)}
						{link === 'failed' && (
							<Alert variant="destructive">
								<TriangleAlert />
								<AlertTitle>Couldn't get the party link</AlertTitle>
								<AlertDescription>Home Assistant couldn't ask Music Assistant for it.</AlertDescription>
							</Alert>
						)}
					</div>

					{/* On phones the buttons share the dialog's full width */}
					<div className="flex flex-wrap justify-center gap-2 max-sm:*:flex-1">
						{(link === 'failed' || (typeof link === 'object' && !url)) && (
							<Button variant="outline" size="xl" onClick={retry}>
								<RefreshCw />
								Try again
							</Button>
						)}
						{url && canShare && (
							<Button
								size="xl"
								onClick={() =>
									void navigator.share({ title: 'Join the party', text: 'Add songs to the queue', url }).catch(() => {})
								}
							>
								<Share2 />
								Share invitation
							</Button>
						)}
						{url && !wallPanel && (
							<Button
								variant="outline"
								size="xl"
								onClick={() =>
									void navigator.clipboard
										?.writeText(url)
										.then(() => setCopied(true))
										.catch(() => {})
								}
							>
								{copied ? <Check /> : <Copy />}
								<StableLabel options={['Copy link', 'Copied']} value={copied ? 1 : 0} />
							</Button>
						)}
					</div>

					<PartyTvs open={open} />
				</DialogContent>
			</Dialog>
		</>
	);
};
