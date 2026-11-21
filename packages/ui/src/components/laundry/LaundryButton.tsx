import { WashingMachineIcon, WindIcon } from 'lucide-react';
import type React from 'preact/compat';
import { useState } from 'preact/compat';
import { useHouseConfig } from '../../context/HouseConfig';
import { laundrySummary } from '../../lib/laundry';
import { cn } from '../../lib/utils';
import { Button, type ButtonProps, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui';
import { LaundryCard, laundryRoom, STATUS_STYLES, useLaundry, useLaundryFinishedToasts } from './LaundryCard';

/**
 * The laundry in the header: shown only while a machine is running (blue, the soonest time left),
 * paused (amber) or done (green); opens the washer and dryer. Also owns the "Washer done" toasts,
 * so every dashboard gets them whether or not it shows the button.
 */
export const LaundryButton: React.FC<{ size?: ButtonProps['size']; className?: string }> = ({
	size = 'xl',
	className,
}) => {
	const [open, setOpen] = useState(false);
	const room = laundryRoom(useHouseConfig());
	const machines = useLaundry(room);
	useLaundryFinishedToasts(machines);
	const summary = laundrySummary(machines);
	if (!summary && !open) return null;

	const Icon = summary?.name === 'Dryer' ? WindIcon : WashingMachineIcon;
	const style = summary ? STATUS_STYLES[summary.status] : undefined;
	return (
		<>
			{summary && style && (
				<Button
					variant="outline"
					size={size}
					onClick={() => setOpen(true)}
					aria-label={`Laundry: ${summary.description}`}
					title={summary.description}
					className={cn('relative', className)}
				>
					<Icon className={style.text} />
					{summary.label && (
						// The label goes below xl (a dot says the same), so it takes little of the header's room
						<span className="tabular-nums max-xl:hidden">{summary.label}</span>
					)}
					<span className={cn('absolute top-1.5 right-1.5 size-2 rounded-full xl:hidden', style.dot)} />
				</Button>
			)}
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-xl">
					<DialogHeader>
						<DialogTitle>Laundry</DialogTitle>
						<DialogDescription>Washer and dryer</DialogDescription>
					</DialogHeader>
					<LaundryCard {...room} className="min-h-40" />
				</DialogContent>
			</Dialog>
		</>
	);
};
