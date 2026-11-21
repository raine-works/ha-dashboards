import { CheckCheck, Printer, Users } from 'lucide-react';
import type React from 'preact/compat';
import { useState } from 'preact/compat';
import { useHassApi } from '../../context/HassContext';
import { houseAction } from '../../lib/household';
import type { PersonView } from '../../lib/people';
import { serviceErrorMessage } from '../../lib/service-calls';
import type { TodoList } from '../../lib/todo';
import { cn } from '../../lib/utils';
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	SwitchRow,
	toast,
} from '../ui';
import { usePrinter } from './usePrinter';

/** A household member's items among those printed, for a list of their own. */
export interface PrintGroup {
	person: PersonView;
	uids: string[];
}

const itemCount = (count: number) => `${count} ${count === 1 ? 'item' : 'items'}`;

/**
 * Prints a to-do list's open items as a checklist on the receipt printer (the integration's `print_todo_list`, else the house's script),
 * or only the `uids` given (the dialog's selection). Nothing without a printer; disabled while
 * there's nothing to print or the printer can't print. With `groups` (a list with assignment, items
 * for more than one person) it asks first: print them all on one slip, or a slip per household
 * member who has any, each with the general tasks (`anyone`) or without. With `markDone` (a shopping
 * list) it asks first too, offering to check off what it prints once it has.
 */
export const PrintListButton: React.FC<{
	list: TodoList;
	uids?: string[];
	size?: 'sm' | 'xl';
	className?: string;
	/** Each member with items among those printed; offers a slip each when there's more than one. */
	groups?: PrintGroup[];
	/** The general tasks (assigned to anyone) among those printed. */
	anyone?: string[];
	/** Checks off what was printed (its uids; undefined = everything printed); given, a tap asks first. */
	markDone?: (uids?: string[]) => void;
}> = ({ list, uids, size = 'sm', className, groups = [], anyone = [], markDone }) => {
	const { callService, getHass } = useHassApi();
	const printer = usePrinter();
	const [printing, setPrinting] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [checkOff, setCheckOff] = useState(false);
	const [withAnyone, setWithAnyone] = useState(true);
	if (!printer) return null;
	const count = uids ? uids.length : list.open;
	const what = uids ? `${itemCount(count)} from ${list.name}` : list.name;
	// A slip each only when it splits something: more than one person, or one and the general tasks
	const canSplit = groups.length > 1 || (groups.length === 1 && anyone.length > 0);
	const slips = groups.map(({ person, uids: mine }) => ({
		person,
		uids: withAnyone ? [...mine, ...anyone] : mine,
	}));
	// Items for someone who isn't a household member go only on the whole list
	const others = Math.max(0, count - groups.reduce((n, g) => n + g.uids.length, 0) - anyone.length);
	// Three buttons stack on a phone; two share the row
	const fill = canSplit ? 'sm:flex-1' : 'flex-1';

	const send = (data: { uids?: string[]; person?: string }) =>
		callService(
			...houseAction(getHass() ?? {}, 'print_todo_list'),
			{
				list: list.entityId,
				printer: printer.printer.entityId,
				...(data.uids && { uids: data.uids }),
				...(data.person && { person: data.person }),
			},
			{ errors: 'throw' },
		);

	// A promise chain, not try/finally: the React Compiler can't take a finally clause
	const printAll = (thenCheckOff: boolean) => {
		setConfirming(false);
		setPrinting(true);
		send({ uids })
			.then(() => {
				toast.success(`Printed ${what}`);
				if (thenCheckOff) markDone?.(uids);
			})
			.catch((err) => toast.error(`Couldn't print ${what}`, { description: serviceErrorMessage(err) }))
			.then(() => setPrinting(false));
	};
	// One slip per person, in turn, so they come out in the order shown
	const printEach = (thenCheckOff: boolean) => {
		setConfirming(false);
		setPrinting(true);
		const printed = slips.flatMap((slip) => slip.uids);
		let done = 0;
		slips
			.reduce<Promise<unknown>>(
				(chain, slip) =>
					chain
						.then(() => send({ uids: slip.uids, person: slip.person.name }))
						.then(() => {
							done += 1;
						}),
				Promise.resolve(),
			)
			.then(() => {
				toast.success(`Printed ${slips.length} lists from ${list.name}`);
				if (thenCheckOff) markDone?.([...new Set(printed)]);
			})
			.catch((err) =>
				toast.error(`Couldn't print ${list.name}`, {
					// The slips before it came out
					description: done
						? `${slips
								.slice(0, done)
								.map((slip) => slip.person.shortName)
								.join(', ')} printed. ${serviceErrorMessage(err)}`
						: serviceErrorMessage(err),
				}),
			)
			.then(() => setPrinting(false));
	};
	const asks = canSplit || !!markDone;

	return (
		<>
			<Button
				variant="outline"
				size={size}
				className={className}
				onClick={() => {
					if (!asks) return printAll(false);
					setCheckOff(false);
					setConfirming(true);
				}}
				loading={printing}
				disabled={!!printer.blockedReason || count === 0}
				title={
					printer.blockedReason ?? (count === 0 ? 'Nothing on it to print' : `Print on the ${printer.printer.name}`)
				}
			>
				<Printer />
				Print
			</Button>
			{asks && (
				<Dialog open={confirming} onOpenChange={setConfirming}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Print {list.name}</DialogTitle>
							<DialogDescription>
								{itemCount(count)} on the {printer.printer.name}
							</DialogDescription>
						</DialogHeader>
						{canSplit && (
							<div className="flex flex-col gap-2">
								<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">A list each</span>
								<ul className="flex flex-col divide-y rounded-md border">
									{slips.map(({ person, uids: theirs }) => (
										<li key={person.entityId} className="flex items-center gap-3 px-3 py-2 text-sm">
											<Avatar className="size-8">
												{person.picture && <AvatarImage src={person.picture} alt={person.shortName} />}
												<AvatarFallback className="text-xs">{person.initials}</AvatarFallback>
											</Avatar>
											<span className="flex-1 truncate font-medium">{person.shortName}</span>
											<span className="text-muted-foreground tabular-nums">{itemCount(theirs.length)}</span>
										</li>
									))}
								</ul>
								{anyone.length > 0 && (
									<SwitchRow
										checked={withAnyone}
										onCheckedChange={setWithAnyone}
										className="-mx-2 touch:min-h-12 rounded-md p-2 font-medium text-sm"
									>
										<Users className="size-5 shrink-0 text-muted-foreground" />
										<span className="flex-1">
											Include tasks for anyone
											<span className="ml-1.5 font-normal text-muted-foreground tabular-nums">{anyone.length}</span>
										</span>
									</SwitchRow>
								)}
								{others > 0 && (
									<p className="text-muted-foreground text-sm">
										{itemCount(others)} for someone else only {others === 1 ? 'prints' : 'print'} with Print all
									</p>
								)}
							</div>
						)}
						{markDone && (
							<SwitchRow
								checked={checkOff}
								onCheckedChange={setCheckOff}
								className="-mx-2 touch:min-h-12 rounded-md p-2 font-medium text-sm"
							>
								<CheckCheck className="size-5 shrink-0 text-muted-foreground" />
								<span className="flex-1">Check them off after printing</span>
							</SwitchRow>
						)}
						<DialogFooter className={cn(!canSplit && 'flex-row')}>
							<Button variant="outline" size="xl" onClick={() => setConfirming(false)} className={fill}>
								Cancel
							</Button>
							<Button
								variant={canSplit ? 'outline' : 'default'}
								size="xl"
								onClick={() => printAll(checkOff)}
								className={fill}
							>
								<Printer />
								{canSplit ? 'Print all' : 'Print'}
							</Button>
							{canSplit && (
								<Button size="xl" onClick={() => printEach(checkOff)} className={fill}>
									<Printer />
									Print {slips.length} lists
								</Button>
							)}
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}
		</>
	);
};
