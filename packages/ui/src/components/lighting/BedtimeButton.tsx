import { Moon } from 'lucide-react';
import type React from 'preact/compat';
import { useState } from 'preact/compat';
import { useEntity, useHassApi } from '../../context/HassContext';
import { useOptimistic } from '../../hooks/useOptimistic';
import { bedtimeService, homeBedtimeEntity } from '../../lib/bedtime';
import { cn } from '../../lib/utils';
import { isUnavailable } from '../../lib/values';
import { Button } from '../ui';
import { BedtimeDialog } from './BedtimeDialog';

export interface BedtimeButtonProps {
	/** The bedtime toggle (`input_boolean.*`). */
	entityId: string;
	/** What it puts to bed ("Master Suite", "Home"), for its label. */
	name: string;
	/** A labeled button (the section header's) or a moon alone (a room's header). */
	labeled?: boolean;
	/** The label gives way to the moon below lg (a wall panel's narrow Lighting column). */
	compact?: boolean;
	/** The signed-in member's own toggle: its dialog also offers Home Bedtime for the whole house. */
	houseOption?: boolean;
	className?: string;
}

/**
 * A bedtime toggle: filled while on. Turning it on asks first, naming the zone and what its routine
 * does (`BedtimeDialog`), which then runs in Home Assistant (automations/bedtime_*.yaml); turning it
 * off doesn't ask. Shows the tap at once; nothing while the toggle doesn't exist.
 */
export const BedtimeButton: React.FC<BedtimeButtonProps> = ({
	entityId,
	name,
	labeled = false,
	compact = false,
	houseOption = false,
	className,
}) => {
	const { callService, getHass } = useHassApi();
	const entity = useEntity(entityId);
	const on = useOptimistic(entity?.state === 'on');
	const [confirming, setConfirming] = useState(false);
	if (!entity) return null;
	const unavailable = isUnavailable(entity.state);
	const set = (value: boolean) => {
		on.set(value);
		callService(...bedtimeService(entityId, value), { entity_id: entityId });
	};
	const toggle = () => {
		if (!on.value) setConfirming(true);
		else set(!on.value);
	};
	const label = `${name} bedtime ${on.value ? 'on' : 'off'}`;
	return (
		<>
			<Button
				variant={on.value ? 'default' : 'outline'}
				size={labeled ? 'lg' : 'icon-xl'}
				onClick={toggle}
				disabled={unavailable}
				aria-pressed={on.value}
				aria-label={label}
				title={label}
				className={cn('shrink-0', className)}
			>
				<Moon className={labeled ? undefined : 'size-5'} />
				{labeled && <span className={cn(compact && 'max-lg:hidden')}>Bedtime</span>}
			</Button>
			{confirming && (
				<BedtimeDialog
					entityId={entityId}
					name={name}
					open
					onCancel={() => setConfirming(false)}
					onConfirm={(extra) => {
						setConfirming(false);
						set(true);
						// The rooms nobody's home in, picked to go to bed with this one
						for (const room of extra) callService(...bedtimeService(room, true), { entity_id: room });
					}}
					// Home Bedtime turns every room on, this one included (the integration keeps them in step)
					onConfirmHouse={
						houseOption
							? () => {
									setConfirming(false);
									on.set(true);
									{
										const home = homeBedtimeEntity(getHass()?.states);
										callService(...bedtimeService(home, true), { entity_id: home });
									}
								}
							: undefined
					}
				/>
			)}
		</>
	);
};
