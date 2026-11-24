/**
 * The guest Wi-Fi's QR code and the dialog that shows it, with the network and password read from it.
 *
 * @module
 */

import { Loader2 } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState } from 'preact/compat';
import { useEntity, useHassSelector } from '../../context/HassContext';
import { useHouseConfig } from '../../context/HouseConfig';
import { cn } from '../../lib/utils';
import type { WifiNetwork } from '../../lib/wifi';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, SURFACE } from '../ui';
import { readWifiCode } from './readWifiCode';

/**
 * The guest network's QR code, while Home Assistant serves it, else undefined: the house settings'
 * `guest_wifi_qr`, the UniFi integration's QR code image for that WLAN (enabled in Home Assistant;
 * it ships disabled), so the password never leaves UniFi and a regenerated one shows here on its
 * own. Named, never discovered: the household network has one too.
 */
export const useGuestWifi = (): { picture: string; network: string } | undefined => {
	const qr = useHouseConfig().guestWifiQr ?? '';
	const entity = useEntity(qr);
	// The network's name is its UniFi device's (the WLAN's SSID)
	const network = useHassSelector(
		(hass) => {
			const deviceId = hass?.entities?.[qr]?.device_id;
			return (deviceId && hass?.devices?.[deviceId]?.name) || null;
		},
		{ watch: (id) => id === qr },
	);
	const picture = entity?.attributes.entity_picture as string | undefined;
	if (!picture || entity?.state === 'unavailable') return undefined;
	return { picture, network: network ?? 'Guest Wi-Fi' };
};

/** The network and password in the code, once read (`readWifiCode`); null when it can't be read. */
function useWifiNetwork(picture: string | undefined, enabled: boolean) {
	const [read, setRead] = useState<{ picture: string; network: WifiNetwork | null } | null>(null);
	useEffect(() => {
		if (!picture || !enabled) return;
		let current = true;
		readWifiCode(picture).then((network) => {
			if (current) setRead({ picture, network });
		});
		return () => {
			current = false;
		};
	}, [picture, enabled]);
	return read && read.picture === picture ? read.network : undefined;
}

/** One fact under the code: its label as an overline, the value large enough to read from a laptop's seat. */
const Fact: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
	<div className="flex min-w-0 flex-col gap-1 py-3">
		<span className="text-muted-foreground text-overline uppercase">{label}</span>
		{/* Selectable (the panels lift user-select: none here), and wrapping a long password rather than cutting it */}
		<span className={cn('select-text break-all text-title', mono && 'font-mono tracking-wide')}>{value}</span>
	</div>
);

/**
 * Guests point their phone's camera at the code to join the guest Wi-Fi; under it, the network's
 * name and password, read from the code, for a laptop that can't scan it.
 */
export const GuestWifiDialog: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
	const wifi = useGuestWifi();
	const network = useWifiNetwork(wifi?.picture, isOpen);
	return (
		<Dialog open={isOpen && !!wifi} onOpenChange={(open) => !open && onClose()}>
			<DialogContent size="detail" className="max-sm:justify-center-safe">
				<DialogHeader className="items-center text-center sm:text-center">
					<DialogTitle>Guest Wi-Fi</DialogTitle>
					<DialogDescription>Point your phone's camera at the code, or type the password on a laptop</DialogDescription>
				</DialogHeader>
				{wifi && (
					<div className="flex flex-col items-center gap-gap">
						{/* UniFi's own code, dark on white with its quiet zone: what every phone camera reads */}
						<img
							src={wifi.picture}
							alt={`QR code to join ${network?.ssid ?? wifi.network}`}
							className="aspect-square w-full max-w-64 short:max-w-36 rounded-tile bg-white [image-rendering:pixelated]"
						/>
						<div className={cn(SURFACE, 'flex w-full flex-col divide-y px-4')}>
							<Fact label="Network" value={network?.ssid ?? wifi.network} />
							{network === undefined ? (
								<div className="flex items-center gap-2 py-3 text-muted-foreground text-sm">
									<Loader2 className="size-4 animate-spin" />
									Reading the password…
								</div>
							) : network?.password ? (
								<Fact label="Password" value={network.password} mono />
							) : network?.security?.toLowerCase() === 'nopass' ? (
								<Fact label="Password" value="None: it's an open network" />
							) : null}
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
};
