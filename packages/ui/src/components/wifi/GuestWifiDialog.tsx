/**
 * The guest Wi-Fi's QR code and the dialog that shows it.
 *
 * @module
 */

import type React from 'preact/compat';
import { useEntity, useHassSelector } from '../../context/HassContext';
import { useHouseConfig } from '../../context/HouseConfig';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui';

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

/** Guests point their phone's camera at the code to join the guest Wi-Fi. */
export const GuestWifiDialog: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
	const wifi = useGuestWifi();
	return (
		<Dialog open={isOpen && !!wifi} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-sm:justify-center-safe">
				<DialogHeader className="items-center text-center sm:text-center">
					<DialogTitle>Guest Wi-Fi</DialogTitle>
					<DialogDescription>Point your phone's camera at the code to join {wifi?.network}</DialogDescription>
				</DialogHeader>
				{wifi && (
					<div className="flex justify-center">
						{/* UniFi's own code, dark on white with its quiet zone: what every phone camera reads */}
						<img
							src={wifi.picture}
							alt={`QR code to join ${wifi.network}`}
							className="aspect-square w-full max-w-72 short:max-w-40 rounded-xl bg-white [image-rendering:pixelated]"
						/>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
};
