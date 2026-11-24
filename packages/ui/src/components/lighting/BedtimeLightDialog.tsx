/**
 * The question before a light turns on in a room in bedtime.
 *
 * @module
 */

import { Lightbulb, Moon, Palette } from 'lucide-react';
import type React from 'preact/compat';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui';
import type { LightControls } from './useLightControls';

/**
 * Asks before a light turns on in a room in bedtime (its own toggle; Home Bedtime alone never asks),
 * so a stray tap on the panel doesn't wake someone. The room's bedtime stays on either way.
 */
export const BedtimeLightDialog: React.FC<{ controls: LightControls }> = ({ controls }) => {
	const pending = controls.bedtimeConfirm;
	const adjust = pending?.kind === 'adjust';
	return (
		<Dialog open={!!pending} onOpenChange={(open) => !open && controls.cancelBedtime()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Moon className="size-5 shrink-0 text-indigo-500 dark:text-indigo-400" />
						{pending?.room.name} Is in Bedtime
					</DialogTitle>
					<DialogDescription>
						{adjust
							? `Picking a color, temperature or effect for ${pending?.what} turns its lights on.`
							: `You're about to turn on ${pending?.what} while ${pending?.room.name} is set to bedtime.`}{' '}
						Its bedtime stays on.
					</DialogDescription>
				</DialogHeader>
				{/* One row, equal widths when there's room, like the bedtime dialog's own */}
				<DialogFooter className="flex-row">
					<Button variant="outline" size="xl" onClick={controls.cancelBedtime} className="flex-1">
						Cancel
					</Button>
					<Button size="xl" onClick={controls.confirmBedtime} className="flex-1">
						{adjust ? <Palette /> : <Lightbulb />}
						{adjust ? 'Adjust anyway' : 'Turn on anyway'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
