/**
 * Phone alerts: which kinds of push the signed-in household member gets on their phone (the
 * doorbell, laundry, the daily brief…), a switch each; Security always comes through. Kept per
 * person by the raineworks_dashboards integration, so the choice follows them to every phone. Only
 * a household member signed in sees it (never a wall panel's shared user, or the admin).
 *
 * @module
 */

import { BellRing, ShieldCheck } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState } from 'preact/compat';
import { useHassApi, useHassReady, useHassSelector } from '../../context/HassContext';
import { INTEGRATION } from '../../lib/household';
import { enabledCount, PUSH_PREFERENCES, PUSH_SET, type PushPreferences, withChoice } from '../../lib/push';
import {
	Button,
	type ButtonProps,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	Switch,
	SwitchRow,
	toast,
} from '../ui';

/**
 * The signed-in member's push settings (null until loaded, and for anyone who isn't a member or a
 * house without the integration), and `set`, which shows a change at once and puts it back with a
 * toast if the integration refuses it.
 */
export function usePushPreferences() {
	const { getHass } = useHassApi();
	const ready = useHassReady();
	const integration = useHassSelector((hass) => !!hass?.config?.components?.includes(INTEGRATION), { watch: [] });
	const [preferences, setPreferences] = useState<PushPreferences | null>(null);

	useEffect(() => {
		const hass = getHass();
		if (!ready || !integration || !hass?.callWS) return;
		let live = true;
		hass.callWS<PushPreferences>({ type: PUSH_PREFERENCES }).then(
			(loaded) => live && setPreferences(loaded),
			() => undefined, // An older integration without push settings: nothing to show
		);
		return () => {
			live = false;
		};
	}, [ready, integration, getHass]);

	const set = (id: string, enabled: boolean) => {
		const hass = getHass();
		if (!preferences || !hass?.callWS) return;
		const before = preferences;
		setPreferences(withChoice(preferences, id, enabled));
		hass.callWS<PushPreferences>({ type: PUSH_SET, category: id, enabled }).then(setPreferences, () => {
			setPreferences(before);
			toast.error("Couldn't save your phone alerts");
		});
	};

	return { preferences: preferences?.person ? preferences : null, set };
}

/** The settings: a switch per kind of push, Security shown on and locked. */
export const PushSettingsDialog: React.FC<{
	isOpen: boolean;
	onClose: () => void;
	preferences: PushPreferences | null;
	onChange: (id: string, enabled: boolean) => void;
}> = ({ isOpen, onClose, preferences, onChange }) => (
	<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
		<DialogContent size="sheet" className="gap-4">
			<DialogHeader>
				<DialogTitle>Phone Alerts</DialogTitle>
				<DialogDescription>What the house sends to your phone</DialogDescription>
			</DialogHeader>
			{preferences && (
				<div className="flex flex-col divide-y overflow-hidden rounded-xl border">
					{preferences.categories.map((category) =>
						category.always ? (
							// Shown on and locked: what keeps the house safe always reaches everyone
							<div key={category.id} className="flex items-center gap-3 px-4 py-3">
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-1.5 font-medium">
										<ShieldCheck className="size-4 text-success" />
										{category.name}
									</div>
									<div className="text-muted-foreground text-sm">{category.description} · always on</div>
								</div>
								<Switch checked disabled aria-label={`${category.name}: always on`} />
							</div>
						) : (
							<SwitchRow
								key={category.id}
								checked={category.enabled}
								onCheckedChange={(enabled) => onChange(category.id, enabled)}
								aria-label={category.name}
								className="px-4 py-3"
							>
								<div className="min-w-0 flex-1">
									<div className="font-medium">{category.name}</div>
									<div className="text-muted-foreground text-sm">{category.description}</div>
								</div>
							</SwitchRow>
						),
					)}
				</div>
			)}
		</DialogContent>
	</Dialog>
);

/**
 * A header button (a bell) opening the member's phone alerts; nothing for anyone who isn't a
 * household member, or a house without the integration.
 */
export const PushSettingsButton: React.FC<{
	size?: ButtonProps['size'];
	/** "Alerts" beside the bell (the phone header's chips). */
	label?: boolean;
	className?: string;
}> = ({ size = 'icon-sm', label, className }) => {
	const { preferences, set } = usePushPreferences();
	const [open, setOpen] = useState(false);
	if (!preferences) return null;
	const title = `Phone alerts: ${enabledCount(preferences)} of ${preferences.categories.length} on`;
	return (
		<>
			<Button
				variant="secondary"
				size={size}
				aria-label={title}
				title={title}
				className={className}
				onClick={() => setOpen(true)}
			>
				<BellRing />
				{label && <span>Alerts</span>}
			</Button>
			<PushSettingsDialog isOpen={open} onClose={() => setOpen(false)} preferences={preferences} onChange={set} />
		</>
	);
};
