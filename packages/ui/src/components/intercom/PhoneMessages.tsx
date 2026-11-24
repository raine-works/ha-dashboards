/**
 * The Messages dialog's Phones tab: a quick or typed message pushed to household members' phones.
 *
 * @module
 */

import { Check, Send } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState } from 'preact/compat';
import { useHassApi, useHassSelector } from '../../context/HassContext';
import { useWallPanelName } from '../../context/WallPanel';
import { withHolidayCategory } from '../../lib/holidayMessages';
import { notifyPeopleAction } from '../../lib/household';
import { PHONE_MESSAGE_MAX, PHONE_PRESETS, phoneMessage, phoneMessageSender } from '../../lib/intercom';
import { discoverPeople, householdFirstName, PEOPLE_WATCH } from '../../lib/people';
import { nameList } from '../../lib/text';
import { cn } from '../../lib/utils';
import { useHoliday } from '../holiday/useHoliday';
import { Avatar, AvatarFallback, AvatarImage, Button, Input, Separator, toggleVariants } from '../ui';
import { PresetPicker } from './PresetPicker';

// Close to the limit: the counter turns amber
const NEAR_LIMIT = PHONE_MESSAGE_MAX - 20;

/**
 * The intercom's Phones tab: a push to household members' phones (`notifyPeopleAction()`), a quick
 * message or a typed one up to `PHONE_MESSAGE_MAX` characters, titled with who sent it (the signed-in
 * person, else the wall panel). Everyone but the sender is listed; the pick is remembered per device.
 */
export const PhoneMessages: React.FC<{
	active: boolean;
	recipients: string[];
	onRecipients: (people: string[]) => void;
}> = ({ active, recipients, onRecipients }) => {
	const { callService, getHass } = useHassApi();
	const wallPanel = useWallPanelName();
	// In a holiday's days its quick messages come first (and open)
	const holiday = useHoliday()?.holiday.id;
	const { people, firstName } = useHassSelector(
		(hass) => {
			if (!active || !hass) return { people: [], firstName: undefined };
			const userId = hass.user?.id;
			const me = Object.values(hass.states).find(
				(s) => s.entity_id.startsWith('person.') && userId && s.attributes.user_id === userId,
			)?.entity_id;
			return {
				people: discoverPeople(hass.states)
					.filter((p) => p.entityId !== me)
					.map((p) => ({ entityId: p.entityId, name: p.shortName, initials: p.initials, picture: p.picture })),
				firstName: householdFirstName(hass.states, userId),
			};
		},
		{ watch: PEOPLE_WATCH },
	);
	const [message, setMessage] = useState('');
	// The quick message being sent (one at a time); typed ones never wait
	const [sending, setSending] = useState<string | null>(null);
	const [status, setStatus] = useState<{ text: string; isError?: boolean } | null>(null);

	// A confirmation clears after a moment; an error stays until the next try
	useEffect(() => {
		if (!status || status.isError) return;
		const timer = setTimeout(() => setStatus(null), 3000);
		return () => clearTimeout(timer);
	}, [status]);

	const ids = people.map((p) => p.entityId);
	// Ignore remembered people who have since gone
	const selected = recipients.filter((id) => ids.includes(id));
	const names = people.filter((p) => selected.includes(p.entityId)).map((p) => p.name);
	const blockedReason = selected.length === 0 ? 'Pick at least one person' : undefined;
	const toggle = (id: string) =>
		onRecipients(selected.includes(id) ? selected.filter((p) => p !== id) : [...selected, id]);

	const send = (text: string, typed = false) => {
		const trimmed = text.trim();
		if (!trimmed || blockedReason || (!typed && sending)) return;
		setStatus(null);
		// A typed message leaves its box at once, and the next can follow
		if (typed) setMessage('');
		else setSending(trimmed);
		const sent = phoneMessage(phoneMessageSender(firstName, wallPanel), trimmed);
		// Messages, a push category each member can turn off (the integration's push settings)
		callService(
			...notifyPeopleAction(getHass() ?? {}),
			{ people: selected, category: 'messages', ...sent },
			{ errors: 'throw' },
		)
			.then(() => setStatus({ text: `Sent to ${nameList(names)}` }))
			.catch(() => {
				setStatus({ text: `Couldn't send to ${nameList(names)}`, isError: true });
				// Put a failed message back to try again, unless something new was typed meanwhile
				if (typed) setMessage((current) => current || trimmed);
			})
			.then(() => {
				if (!typed) setSending(null);
			});
	};

	const typed = message.trim();
	const left = PHONE_MESSAGE_MAX - message.length;

	return (
		<div className="flex min-h-0 flex-1 gap-6 short:gap-4 max-md:flex-col max-md:gap-4 max-md:overflow-y-auto">
			{/* Who gets it */}
			<div className="flex w-72 shrink-0 flex-col gap-3 max-md:w-full">
				<div className="flex items-center justify-between">
					<span className="font-medium text-sm">People</span>
					<div className="flex gap-1">
						<Button variant="ghost" size="sm" onClick={() => onRecipients(ids)}>
							All
						</Button>
						<Button variant="ghost" size="sm" onClick={() => onRecipients([])}>
							None
						</Button>
					</div>
				</div>
				<div className="flex min-h-0 flex-col gap-2 overflow-y-auto p-0.5">
					{people.length === 0 && <p className="text-muted-foreground text-sm">No household phones found.</p>}
					{people.map((person) => {
						const isOn = selected.includes(person.entityId);
						return (
							<button
								key={person.entityId}
								type="button"
								aria-pressed={isOn}
								data-state={isOn ? 'on' : 'off'}
								onClick={() => toggle(person.entityId)}
								className={cn(toggleVariants({ variant: 'chip', size: 'xl' }), 'w-full shrink-0 justify-start')}
							>
								<Avatar className="size-7">
									{person.picture && <AvatarImage src={person.picture} alt="" />}
									<AvatarFallback className="text-[11px]">{person.initials}</AvatarFallback>
								</Avatar>
								<span className="truncate">{person.name}</span>
								<span
									className={cn(
										'ml-auto flex size-5 shrink-0 items-center justify-center rounded-full border',
										isOn && 'border-primary bg-primary text-primary-foreground',
									)}
								>
									{isOn && <Check className="size-3" />}
								</span>
							</button>
						);
					})}
				</div>
			</div>

			<Separator orientation="vertical" className="max-md:hidden" />

			{/* What it says */}
			<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 short:gap-3 overflow-y-auto overflow-x-hidden p-1 max-md:flex-auto max-md:overflow-visible">
				<PresetPicker
					title="Quick messages"
					categories={withHolidayCategory(PHONE_PRESETS, holiday, (m) => m.phone)}
					storageKey="panel-ui:intercom-phone-category"
				>
					{(preset) => (
						<Button
							key={preset}
							variant="outline"
							size="lg"
							onClick={() => send(preset)}
							loading={sending === preset}
							disabled={!!blockedReason || (sending !== null && sending !== preset)}
							title={blockedReason ?? preset}
						>
							{preset}
						</Button>
					)}
				</PresetPicker>

				{/* On phones the message box sits at the bottom edge, the quick messages staying under the people */}
				<form
					className="flex flex-col gap-1.5 max-md:mt-auto"
					onSubmit={(e) => {
						e.preventDefault();
						send(message, true);
					}}
				>
					<div className="flex gap-2">
						{/* What's left sits at the box's right end (push notifications cut long text off; amber near the end) */}
						<div className="relative min-w-0 flex-1">
							<Input
								value={message}
								maxLength={PHONE_MESSAGE_MAX}
								onInput={(e) => setMessage((e.target as HTMLInputElement).value.slice(0, PHONE_MESSAGE_MAX))}
								placeholder="Type a message…"
								aria-label="Message for their phones"
								aria-describedby="phone-message-count"
								// The keyboard resizes the panel after focus; bring the box back into view once it has
								onFocus={(e) => {
									const input = e.currentTarget;
									setTimeout(() => input.scrollIntoView({ block: 'nearest' }), 350);
								}}
								className="h-12 pr-14 text-base md:text-base"
							/>
							<span
								id="phone-message-count"
								className={cn(
									'pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-muted-foreground text-xs tabular-nums',
									message.length > NEAR_LIMIT && 'text-warning',
								)}
							>
								{left}
								<span className="sr-only"> characters left</span>
							</span>
						</div>
						<Button type="submit" size="xl" disabled={!!blockedReason || !typed} title={blockedReason}>
							<Send />
							Send
						</Button>
					</div>
					{/* The last result, on a line that's always there, so a result coming and going never moves the box */}
					<p
						role="status"
						className={cn('h-5 truncate text-sm', status?.isError ? 'text-destructive' : 'text-muted-foreground')}
					>
						{status?.text}
					</p>
				</form>
			</div>
		</div>
	);
};
