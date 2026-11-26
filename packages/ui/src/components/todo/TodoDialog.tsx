/**
 * The to-do dialog: every list as a tab, its items to add, check off, reorder, date and delete.
 *
 * @module
 */

import { Check, CheckCheck, GripVertical, ListTodo, Loader2, Plus, Trash2, Undo2, Users, X } from 'lucide-react';
import type React from 'preact/compat';
import { memo, useEffect, useId, useRef, useState } from 'preact/compat';
import { useHassApi, useHassSelector } from '../../context/HassContext';
import { useStableCallbacks } from '../../hooks/useStableCallbacks';
import { todoAssigneeAction } from '../../lib/household';
import { discoverPeople, PEOPLE_WATCH, type PersonView } from '../../lib/people';
import { dragShift, dragTargetAt, edgeScroll, moveIndex } from '../../lib/reorder';
import { serviceErrorMessage } from '../../lib/service-calls';
import { readStored, writeStored } from '../../lib/storage';
import {
	type Due,
	dueOf,
	dueServiceData,
	formatDue,
	isShoppingList,
	matchAssignee,
	moveAfter,
	parseAssignee,
	sameDue,
	splitTodoItems,
	summaryList,
	TODO_FEATURE,
	type TodoItem,
	type TodoList,
	todoSupports,
	withAssignee,
} from '../../lib/todo';
import { hapticTap } from '../../lib/tones';
import { cn } from '../../lib/utils';
import { HolidayPeek } from '../holiday/HolidayEgg';
import { PrintListButton } from '../printer/PrintListButton';
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
	Badge,
	Button,
	Checkbox,
	ChipRow,
	ConfirmButton,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	EmptyState,
	Input,
	NumberFlow,
	Popover,
	PopoverContent,
	PopoverTrigger,
	SwipeRow,
	Tabs,
	TabsList,
	TabsTrigger,
	toast,
} from '../ui';
import { DueDatePicker } from './DueDatePicker';
import { useTodoItems, useTodoLists } from './useTodo';

const LIST_KEY = 'todo-dialog:list';
// Optimistic changes are dropped if Home Assistant hasn't reported them by then
const PENDING_MS = 10_000;
// The list's gap between rows (gap-2): how far the others slide past a dragged row, with its height
const ROW_GAP_PX = 8;
// A deleted item waits this long (its toast's Undo) before Home Assistant deletes it
const UNDO_MS = 5000;

/** The to-do dialog's props: whether it's open, what closes it, and what it opens on. */
export interface TodoDialogProps {
	isOpen: boolean;
	onClose: () => void;
	/** Open on this list (a notification's link), instead of the last one picked. */
	list?: string;
	/** Scroll to this item (uid) and highlight it for a moment. */
	focusItem?: string;
	/**
	 * A household member's counts (`useMyTodoCounts()`): the tabs and the description count what's
	 * theirs or anyone's on those lists instead of everyone's.
	 */
	counts?: Record<string, number>;
}

// How long a linked item stays highlighted
const FOCUS_MS = 6000;

const DUE_BADGE = { overdue: 'warning', today: 'info', upcoming: 'outline' } as const;

const DueBadge: React.FC<{ due: string }> = ({ due }) => {
	const { label, tone } = formatDue(due);
	return (
		<Badge variant={DUE_BADGE[tone]} className="shrink-0">
			{label}
		</Badge>
	);
};

const PersonAvatar: React.FC<{ person: PersonView; className?: string }> = ({ person, className }) => (
	<Avatar className={cn('size-6', className)}>
		{person.picture && <AvatarImage src={person.picture} alt={person.shortName} />}
		<AvatarFallback className="text-[10px]">{person.initials}</AvatarFallback>
	</Avatar>
);

/** Who an item is for: Anyone (a general task) or one person. */
const AssigneePicker: React.FC<{
	people: PersonView[];
	value?: string;
	onChange: (name: string | undefined) => void;
}> = ({ people, value, onChange }) => {
	const selected = matchAssignee(value, people);
	return (
		<ChipRow role="radiogroup" aria-label="Assigned to" className="basis-full">
			<Button
				type="button"
				role="radio"
				aria-checked={!value}
				variant={!value ? 'default' : 'outline'}
				size="lg"
				onClick={() => onChange(undefined)}
			>
				<Users />
				Anyone
			</Button>
			{people.map((person) => (
				<Button
					key={person.entityId}
					type="button"
					role="radio"
					aria-checked={selected === person}
					variant={selected === person ? 'default' : 'outline'}
					size="lg"
					onClick={() => onChange(person.name)}
					className="pl-2 has-[>svg]:pl-2"
				>
					<PersonAvatar person={person} />
					{person.shortName}
				</Button>
			))}
		</ChipRow>
	);
};

/**
 * A new item, on the dialog's bottom edge: who it's for (when the list has assignment), its summary
 * and due date, and Add. `defaultAssignee` presets it (the person the list is filtered to). Editing
 * an item is a dialog of its own (`EditItemDialog`).
 */
const ItemForm: React.FC<{
	list: TodoList;
	people: PersonView[];
	defaultAssignee?: string;
	onSubmit: (summary: string, due: Due | null, assignee: string | undefined) => void;
	className?: string;
}> = ({ list, people, defaultAssignee, onSubmit, className }) => {
	const [summary, setSummary] = useState('');
	const [assignee, setAssignee] = useState(defaultAssignee);
	const canAssign = people.length > 0 && todoSupports(list, TODO_FEATURE.SET_DESCRIPTION);
	// Follow the filter
	useEffect(() => {
		setAssignee(defaultAssignee);
	}, [defaultAssignee]);
	const [due, setDue] = useState<Due | null>(null);
	const withTime = todoSupports(list, TODO_FEATURE.SET_DUE_DATETIME);
	const hasDue = withTime || todoSupports(list, TODO_FEATURE.SET_DUE_DATE);

	const submit = (e: Event) => {
		e.preventDefault();
		if (!summary.trim()) return;
		onSubmit(summary.trim(), due, assignee);
		setSummary('');
		setDue(null);
		setAssignee(defaultAssignee);
	};

	return (
		<form onSubmit={submit} className={cn('flex flex-wrap items-center gap-2', className)}>
			{/* Who it's for sits above the text box */}
			{canAssign && <AssigneePicker people={people} value={assignee} onChange={setAssignee} />}
			<Input
				value={summary}
				onInput={(e) => setSummary((e.target as HTMLInputElement).value)}
				placeholder={`Add to ${list.name}…`}
				aria-label={`New item for ${list.name}`}
				enterKeyHint="enter"
				className="h-12 min-w-40 flex-1 text-base max-sm:basis-full md:text-base"
			/>
			{/* On phones the text box has its row to itself, the due date and Add sharing the one under it */}
			{hasDue && (
				<DueDatePicker value={due} onChange={setDue} withTime={withTime} className="max-sm:max-w-none max-sm:flex-1" />
			)}
			<Button type="submit" size="xl" disabled={!summary.trim()} className="max-sm:flex-1">
				<Plus />
				Add
			</Button>
		</form>
	);
};

/** One field of the edit dialog: its label as an overline, then the control. */
const Field: React.FC<{ label: string; htmlFor?: string; children: React.ReactNode }> = ({
	label,
	htmlFor,
	children,
}) => (
	<div className="flex min-w-0 flex-col gap-2">
		<label htmlFor={htmlFor} className="text-muted-foreground text-overline uppercase">
			{label}
		</label>
		{children}
	</div>
);

/**
 * An item's edit dialog (`detail`: a sheet from the bottom on phones, dragged down to close): what it
 * says, when it's due and who it's for, each under its own label, then Delete and Save. Opened by
 * tapping the item; closing it any other way (Escape, the X, a tap outside, Back) leaves the item as
 * it was. Its fields start from the item, afresh each time it opens.
 */
const EditItemDialog: React.FC<{
	list: TodoList;
	people: PersonView[];
	/** The item being edited (null: closed). */
	item: TodoItem | null;
	onSave: (item: TodoItem, summary: string, due: Due | null, assignee: string | undefined) => void;
	onDelete: (item: TodoItem) => void;
	onClose: () => void;
}> = ({ list, people, item, onSave, onDelete, onClose }) => (
	<Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
		<DialogContent size="detail">
			<DialogHeader>
				<DialogTitle>Edit Item</DialogTitle>
				<DialogDescription>{list.name}</DialogDescription>
			</DialogHeader>
			{item && (
				<EditItemFields key={item.uid} list={list} people={people} item={item} onSave={onSave} onDelete={onDelete} />
			)}
		</DialogContent>
	</Dialog>
);

const EditItemFields: React.FC<{
	list: TodoList;
	people: PersonView[];
	item: TodoItem;
	onSave: (item: TodoItem, summary: string, due: Due | null, assignee: string | undefined) => void;
	onDelete: (item: TodoItem) => void;
}> = ({ list, people, item, onSave, onDelete }) => {
	const [summary, setSummary] = useState(item.summary);
	const [due, setDue] = useState<Due | null>(() => dueOf(item.due));
	const [assignee, setAssignee] = useState(parseAssignee(item.description).assignee);
	const canAssign = people.length > 0 && todoSupports(list, TODO_FEATURE.SET_DESCRIPTION);
	const withTime = todoSupports(list, TODO_FEATURE.SET_DUE_DATETIME);
	const hasDue = withTime || todoSupports(list, TODO_FEATURE.SET_DUE_DATE);
	const canDelete = todoSupports(list, TODO_FEATURE.DELETE);
	const id = useId();

	const submit = (e: Event) => {
		e.preventDefault();
		if (summary.trim()) onSave(item, summary.trim(), due, assignee);
	};

	return (
		<form onSubmit={submit} className="contents">
			<div className="flex min-w-0 flex-col gap-4">
				<Field label="Item" htmlFor={`${id}-summary`}>
					<Input
						id={`${id}-summary`}
						value={summary}
						onInput={(e) => setSummary((e.target as HTMLInputElement).value)}
						enterKeyHint="done"
						className="h-12 text-base md:text-base"
					/>
				</Field>
				{hasDue && (
					<Field label="Due">
						<DueDatePicker value={due} onChange={setDue} withTime={withTime} className="max-w-none self-start" />
					</Field>
				)}
				{canAssign && (
					<Field label="For">
						<AssigneePicker people={people} value={assignee} onChange={setAssignee} />
					</Field>
				)}
			</div>
			<DialogFooter>
				{canDelete && (
					<Button type="button" variant="outline" size="xl" onClick={() => onDelete(item)} className="sm:mr-auto">
						<Trash2 />
						Delete
					</Button>
				)}
				<Button type="submit" size="xl" disabled={!summary.trim()}>
					<Check />
					Save
				</Button>
			</DialogFooter>
		</form>
	);
};

/** What a row does: the same functions every render (`useStableCallbacks`), so rows stay memoized. */
type RowHandlers = {
	select: (uid: string) => void;
	/** Held: starts selecting, with this item. */
	longPress: (uid: string) => void;
	toggle: (item: TodoItem) => void;
	/** Tapped: opens its edit dialog (or, while selecting, picks it). */
	edit: (uid: string) => void;
	remove: (item: TodoItem) => void;
	startDrag: (uid: string, e: React.PointerEvent<HTMLElement>) => void;
	moveDrag: (uid: string, y: number) => void;
	endDrag: (uid: string, cancelled: boolean) => void;
	/** Moved by the keyboard: places up (negative) or down; ±Infinity for the top or bottom. */
	step: (uid: string, by: number) => void;
};

/** A row's people when its list has no assignment: the same empty list every render (`memo`). */
const NO_PEOPLE: PersonView[] = [];

/**
 * An item (`memo`): its props are its own (selected, dragged, how far it's slid) plus stable
 * handlers, so a change to one item, or a drag, re-renders only the rows it touches.
 */
const TodoRow = memo(
	({
		list,
		people,
		item,
		selected,
		focused,
		reorder,
		lifted,
		offset,
		handlers,
	}: {
		list: TodoList;
		people: PersonView[];
		item: TodoItem;
		selected: boolean;
		/** Highlighted (opened from a notification). */
		focused: boolean;
		/** Has a grip to drag it to a new place. */
		reorder: boolean;
		/** Being dragged: lifted over the others. */
		lifted: boolean;
		/** How far it's moved (px) while an item is dragged. */
		offset?: number;
		handlers: RowHandlers;
	}) => {
		const done = item.status === 'completed';
		const { assignee, note } = parseAssignee(item.description);
		const person = matchAssignee(assignee, people);
		const canEdit = todoSupports(list, TODO_FEATURE.UPDATE);
		return (
			// Swipe right to check it off (or back on the list, on the Checked off tab), left to delete
			<SwipeRow
				data-uid={item.uid}
				start={
					canEdit
						? done
							? { label: 'Back on list', icon: <Undo2 />, tone: 'info', onAction: () => handlers.toggle(item) }
							: {
									label: isShoppingList(list) ? 'Got it' : 'Done',
									icon: <Check />,
									tone: 'success',
									onAction: () => handlers.toggle(item),
								}
						: undefined
				}
				end={
					todoSupports(list, TODO_FEATURE.DELETE)
						? { label: 'Delete', icon: <Trash2 />, tone: 'destructive', onAction: () => handlers.remove(item) }
						: undefined
				}
				onLongPress={() => handlers.longPress(item.uid)}
				style={offset !== undefined ? { transform: `translateY(${offset}px)` } : undefined}
				className={cn(
					'shrink-0',
					lifted ? 'z-10 shadow-lg' : offset !== undefined && 'transition-transform duration-150',
				)}
				contentClassName={cn(
					'flex items-center gap-3 rounded-lg border bg-card py-1.5 pl-3 transition-shadow',
					reorder ? 'pr-0' : 'pr-3',
					selected && 'border-primary bg-accent',
					focused && 'border-primary ring-[3px] ring-ring/50',
				)}
			>
				<Checkbox
					size="xl"
					checked={selected}
					onCheckedChange={() => handlers.select(item.uid)}
					aria-label={selected ? `Deselect ${item.summary}` : `Select ${item.summary}`}
				/>
				{/* The text is a touch target too: tap to edit */}
				<button
					type="button"
					onClick={() => handlers.edit(item.uid)}
					disabled={!canEdit}
					className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-md py-1 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
				>
					<span className="flex min-w-0 items-center gap-2">
						<span className={cn('wrap-break-word min-w-0', done && 'text-muted-foreground line-through')}>
							{item.summary}
						</span>
						{item.due && !done && <DueBadge due={item.due} />}
					</span>
					{note && <span className="line-clamp-2 whitespace-pre-line text-muted-foreground text-xs">{note}</span>}
				</button>
				{/* Who it's for (nothing for anyone); a name that isn't a household person shows as text */}
				{person ? (
					<span title={`Assigned to ${person.name}`} className={cn('shrink-0', done && 'opacity-50')}>
						<PersonAvatar person={person} className="size-8" />
						<span className="sr-only">Assigned to {person.name}</span>
					</span>
				) : (
					assignee && (
						<Badge variant="outline" className="shrink-0">
							{assignee}
						</Badge>
					)
				)}
				{/* Drag by the grip to a new place (a swipe or scroll anywhere else is the row's own); with
				    focus on it, the arrow keys move it a place, Home and End to the top or bottom */}
				{reorder && (
					<button
						type="button"
						aria-label={`Move ${item.summary}`}
						title="Drag, or use the arrow keys, to move it"
						// Its own ticks as it passes each row
						data-haptic="off"
						onKeyDown={(e) => {
							const step = { ArrowUp: -1, ArrowDown: 1, Home: -Infinity, End: Infinity }[e.key];
							if (step === undefined) return;
							e.preventDefault();
							handlers.step(item.uid, step);
						}}
						onPointerDown={(e) => {
							e.stopPropagation();
							handlers.startDrag(item.uid, e);
						}}
						onPointerMove={(e) => {
							e.stopPropagation();
							handlers.moveDrag(item.uid, e.clientY);
						}}
						onPointerUp={(e) => {
							e.stopPropagation();
							handlers.endDrag(item.uid, false);
						}}
						onPointerCancel={() => handlers.endDrag(item.uid, true)}
						className={cn(
							'flex min-h-11 w-11 shrink-0 cursor-grab touch-none items-center justify-center self-stretch rounded-md text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
							lifted && 'cursor-grabbing text-foreground',
						)}
					>
						<GripVertical className="size-5" />
					</button>
				)}
			</SwipeRow>
		);
	},
);

/** The selection's Assign: who the selected items are for, Anyone or a person, applied on a tap. */
const BulkAssign: React.FC<{
	people: PersonView[];
	items: TodoItem[];
	onAssign: (assignee: string | undefined) => void;
}> = ({ people, items, onAssign }) => {
	const [open, setOpen] = useState(false);
	// Ticked when every selected item is already theirs
	const keyOf = (item: TodoItem) => {
		const { assignee } = parseAssignee(item.description);
		return assignee ? (matchAssignee(assignee, people)?.entityId ?? assignee) : 'anyone';
	};
	const shared = items.every((item) => keyOf(item) === keyOf(items[0])) ? keyOf(items[0]) : undefined;
	const pick = (assignee: string | undefined) => {
		setOpen(false);
		onAssign(assignee);
	};
	const choices = [
		{ key: 'anyone', label: 'Anyone', name: undefined, person: undefined },
		...people.map((p) => ({ key: p.entityId, label: p.shortName, name: p.name, person: p })),
	];
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="outline" size="xl">
					<Users />
					Assign
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="flex w-56 flex-col gap-1 p-2">
				<div role="radiogroup" aria-label="Assign to" className="flex flex-col gap-1">
					{choices.map(({ key, label, name, person }) => (
						<Button
							key={key}
							role="radio"
							aria-checked={shared === key}
							variant="ghost"
							size="lg"
							onClick={() => pick(name)}
							// One padding whatever the row holds (a direct icon would narrow it), the icon in the avatar's box
							className="justify-start px-3 has-[>svg]:px-3"
						>
							<span className="flex size-6 shrink-0 items-center justify-center">
								{person ? <PersonAvatar person={person} /> : <Users />}
							</span>
							{label}
							{shared === key && <Check className="ml-auto" />}
						</Button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
};

/**
 * The selection's Due date: their shared due date (blank when they differ), applied to them all once
 * the picker closes, so trying days on the way doesn't update every item each time.
 */
const BulkDue: React.FC<{ items: TodoItem[]; withTime: boolean; onApply: (due: Due | null) => void }> = ({
	items,
	withTime,
	onApply,
}) => {
	const first = dueOf(items[0]?.due);
	const shared = items.every((item) => sameDue(dueOf(item.due), first)) ? first : null;
	// What's been picked (null: nothing yet); applied by the effect, which sees the latest pick
	const [draft, setDraft] = useState<{ due: Due | null } | null>(null);
	const [closes, setCloses] = useState(0);
	useEffect(() => {
		if (!closes || !draft) return;
		setDraft(null);
		onApply(draft.due);
	}, [closes]);
	return (
		<DueDatePicker
			value={draft ? draft.due : shared}
			onChange={(due) => setDraft({ due })}
			onOpenChange={(open) => !open && setCloses((n) => n + 1)}
			withTime={withTime}
		/>
	);
};

/** "Milk", or "3 items": what a toast about some items calls them. */
const itemsLabel = (items: TodoItem[]) => (items.length === 1 ? items[0].summary : `${items.length} items`);

/**
 * One list's open items (`view` 'open'): swipe one right to check it off and left to delete it (each
 * with Undo in its toast), tap its text to edit it, and add one in the row at the bottom edge. The
 * checkbox on each row selects it: while some are, the add row gives way to what can be done to them
 * all (Mark done, Print, Delete). Lists with descriptions (Chores) also assign items to a household
 * person or anyone, and filter by it. Its completed items are the Checked off tab's (`view`
 * 'completed': swipe right to put one back on the list, a two-tap Clear); a bought item leaves a
 * shopping list's own tab for it (the weekly clear-out removes it from Home Assistant).
 */
const TodoListView: React.FC<{
	list: TodoList;
	enabled: boolean;
	view: 'open' | 'completed';
	focusItem?: string;
	/** One of several lists on the Checked off tab: its name over its items, Clear beside it. */
	heading?: boolean;
}> = ({ list, enabled, view, focusItem, heading }) => {
	const { callService, getHass } = useHassApi();
	// Household members (people with a phone), whom items can be assigned to
	const people = useHassSelector((hass) => discoverPeople(hass?.states ?? {}), { watch: PEOPLE_WATCH });
	const canAssign = people.length > 0 && todoSupports(list, TODO_FEATURE.SET_DESCRIPTION);
	const shopping = isShoppingList(list);
	// 'all', 'anyone' (unassigned) or a person's entity id
	const [filter, setFilter] = useState('all');
	// Selected items (uids); only the ones shown count
	const [selected, setSelected] = useState<string[]>([]);
	const { items, loaded, failed, retry } = useTodoItems(list.entityId, enabled);
	// A linked item: show everyone's, scroll to it once it's loaded, and highlight it for a moment
	const [focused, setFocused] = useState<string | undefined>();
	const listRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!focusItem || !loaded) return;
		setFilter('all');
		setSelected([]);
		setFocused(focusItem);
		const frame = requestAnimationFrame(() =>
			listRef.current?.querySelector(`[data-uid="${CSS.escape(focusItem)}"]`)?.scrollIntoView({ block: 'center' }),
		);
		const timer = setTimeout(() => setFocused(undefined), FOCUS_MS);
		return () => {
			cancelAnimationFrame(frame);
			clearTimeout(timer);
		};
	}, [focusItem, loaded]);
	const [statusOverrides, setStatusOverrides] = useState<Record<string, TodoItem['status']>>({});
	const [removed, setRemoved] = useState<string[]>([]);
	// Deletes whose toast is still up (Undo still offered), so not yet sent to Home Assistant
	const unsent = useRef(new Set<string>());
	const [editing, setEditing] = useState<string | null>(null);
	// An item dragged by its grip: where it and the rows were (px, in the list's content) when it was
	// picked up, where the finger is, how far the list has scrolled since
	const [drag, setDrag] = useState<{
		uid: string;
		from: number;
		startY: number;
		y: number;
		startScroll: number;
		scroll: number;
		tops: number[];
		heights: number[];
	} | null>(null);
	// The list's order (uids) after a move, until Home Assistant reports it
	const [order, setOrder] = useState<string[] | null>(null);

	// Optimistic state lasts until Home Assistant reports it (or gives up)
	useEffect(() => {
		// Nothing to reconcile while (re)subscribing: the empty list isn't Home Assistant's
		if (!loaded) return;
		// The same object when nothing was reported, so an update about other items renders once and
		// leaves the fallback's timer running
		setStatusOverrides((current) => {
			const reported = items.filter((item) => current[item.uid] === item.status);
			if (reported.length === 0) return current;
			const next = { ...current };
			for (const item of reported) delete next[item.uid];
			return next;
		});
		setRemoved((current) => {
			const left = current.filter((uid) => items.some((i) => i.uid === uid));
			return left.length === current.length ? current : left;
		});
		setOrder((current) =>
			current && items.every((item, i) => item.uid === current.filter((uid) => items.some((x) => x.uid === uid))[i])
				? null
				: current,
		);
	}, [items, loaded]);
	useEffect(() => {
		if (!order) return;
		const timer = setTimeout(() => setOrder(null), PENDING_MS);
		return () => clearTimeout(timer);
	}, [order]);
	useEffect(() => {
		if (Object.keys(statusOverrides).length === 0 && removed.length === 0) return;
		const timer = setTimeout(() => {
			setStatusOverrides({});
			// A delete still waiting on its toast (held open past this, since it pauses while touched)
			// stays hidden: it hasn't been sent yet
			setRemoved((current) => current.filter((uid) => unsent.current.has(uid)));
		}, PENDING_MS);
		return () => clearTimeout(timer);
	}, [statusOverrides, removed]);

	const ordered = order ? [...items].sort((a, b) => order.indexOf(a.uid) - order.indexOf(b.uid)) : items;
	const shown = ordered
		.filter((item) => !removed.includes(item.uid))
		.map((item) => (statusOverrides[item.uid] ? { ...item, status: statusOverrides[item.uid] } : item));
	// Who each item is for: a household person's entity id, 'anyone', or an unknown name (All only)
	const assignedTo = (item: TodoItem) => {
		const { assignee } = parseAssignee(item.description);
		if (!assignee) return 'anyone';
		return matchAssignee(assignee, people)?.entityId ?? assignee;
	};
	const filterPerson = people.find((p) => p.entityId === filter);
	const { open, completed } = splitTodoItems(shown);
	const filtered = canAssign && filter !== 'all' ? open.filter((item) => assignedTo(item) === filter) : open;
	const openCount = (key: string) =>
		key === 'all' ? open.length : open.filter((item) => assignedTo(item) === key).length;
	const visible = view === 'open' ? filtered : completed;
	const picked = visible.filter((item) => selected.includes(item.uid));
	const pickedUids = picked.map((item) => item.uid);
	// Printing: each member's items among those printed, and the general tasks, for a slip each
	const printGroups = (targets: TodoItem[]) =>
		canAssign
			? people
					.map((person) => ({
						person,
						uids: targets.filter((item) => assignedTo(item) === person.entityId).map((item) => item.uid),
					}))
					.filter((group) => group.uids.length > 0)
			: [];
	const generalUids = (targets: TodoItem[]) =>
		canAssign ? targets.filter((item) => assignedTo(item) === 'anyone').map((item) => item.uid) : [];
	// Checks off what a print printed (undefined = all of them)
	const completePrinted = (targets: TodoItem[]) => (printed?: string[]) =>
		complete(printed ? targets.filter((item) => printed.includes(item.uid)) : targets);
	const selectAll = () => setSelected(picked.length === visible.length ? [] : visible.map((item) => item.uid));
	const toggleSelected = (uid: string) =>
		setSelected((current) => (current.includes(uid) ? current.filter((u) => u !== uid) : [...current, uid]));
	const pickFilter = (key: string) => {
		setFilter(key);
		setSelected([]);
	};
	const service = (name: string, data: Record<string, unknown> = {}) =>
		callService('todo', name, { entity_id: list.entityId, ...data });

	const withTime = todoSupports(list, TODO_FEATURE.SET_DUE_DATETIME);
	/**
	 * Tell whom an item is for: a push to the assignee's phone, or to the whole household (but whoever
	 * added it) for an item anyone can do, tapping through to this list (`todoAssigneeAction()`: the integration's, else the house's script).
	 */
	const notifyAssignee = (summary: string, assignee: string | undefined, uid?: string) => {
		const person = matchAssignee(assignee, people);
		// Assigned to a name that isn't a household person: nobody to tell
		if (assignee && !person) return;
		callService(...todoAssigneeAction(getHass() ?? {}), {
			...(person ? { person: person.entityId } : {}),
			list: list.entityId,
			item: summary,
			...(uid ? { uid } : {}),
		});
	};
	// Only an item that was added is announced: a failed add says so instead of pushing to phones
	// (a promise chain: the React Compiler can't take this try/catch)
	const add = (summary: string, due: Due | null, assignee: string | undefined) =>
		callService(
			'todo',
			'add_item',
			{
				entity_id: list.entityId,
				item: summary,
				...(due ? dueServiceData(due, withTime) : {}),
				...(canAssign && assignee ? { description: withAssignee(undefined, assignee) } : {}),
			},
			{ errors: 'throw' },
		).then(
			() => {
				if (canAssign) notifyAssignee(summary, assignee);
			},
			(err) => {
				toast.error(`Couldn't add ${summary}`, { description: serviceErrorMessage(err) });
			},
		);
	const setStatus = (item: TodoItem, status: TodoItem['status']) => {
		setStatusOverrides((current) => ({ ...current, [item.uid]: status }));
		service('update_item', { item: item.uid, status });
	};
	// Checked off (open items) or back on the list (the Checked off tab's); a mis-swipe has Undo
	const complete = (targets: TodoItem[]) => {
		setSelected([]);
		for (const item of targets) setStatus(item, 'completed');
		toast(shopping ? `Got ${itemsLabel(targets)}` : `Done: ${itemsLabel(targets)}`, {
			action: {
				label: 'Undo',
				onClick: () => {
					for (const item of targets) setStatus(item, 'needs_action');
				},
			},
		});
	};
	// Who the selection is for: each item's assignee line changes (its note stays); one push to the
	// person for what's newly theirs, never one per item
	const assign = (targets: TodoItem[], assignee: string | undefined) => {
		setSelected([]);
		const person = matchAssignee(assignee, people);
		const newly: TodoItem[] = [];
		for (const item of targets) {
			const { assignee: before, note } = parseAssignee(item.description);
			const description = withAssignee(note, assignee);
			if (description === (item.description || null)) continue;
			service('update_item', { item: item.uid, description });
			if (person && matchAssignee(before, people)?.entityId !== person.entityId) newly.push(item);
		}
		if (!person || newly.length === 0) return;
		if (newly.length === 1) return notifyAssignee(newly[0].summary, assignee, newly[0].uid);
		callService(...todoAssigneeAction(getHass() ?? {}), {
			person: person.entityId,
			list: list.entityId,
			item: summaryList(newly.map((item) => item.summary)),
			uids: newly.map((item) => item.uid),
		});
	};
	const setDue = (targets: TodoItem[], due: Due | null) => {
		setSelected([]);
		for (const item of targets) {
			if (!sameDue(due, dueOf(item.due))) service('update_item', { item: item.uid, ...dueServiceData(due, withTime) });
		}
	};
	const reopen = (targets: TodoItem[]) => {
		setSelected([]);
		for (const item of targets) setStatus(item, 'needs_action');
	};
	const toggle = (item: TodoItem) => (item.status === 'completed' ? reopen([item]) : complete([item]));
	const save = (item: TodoItem, summary: string, due: Due | null, assignee: string | undefined) => {
		setEditing(null);
		const data: Record<string, unknown> = { item: item.uid };
		if (summary !== item.summary) data.rename = summary;
		// The assignee line changes; the rest of the description (its note) stays
		if (canAssign) {
			const description = withAssignee(parseAssignee(item.description).note, assignee);
			if (description !== (item.description || null)) data.description = description;
		}
		// No due clears it; an unchanged one is left alone
		const hasDue = withTime || todoSupports(list, TODO_FEATURE.SET_DUE_DATE);
		if (hasDue && !sameDue(due, dueOf(item.due))) Object.assign(data, dueServiceData(due, withTime));
		if (Object.keys(data).length > 1) service('update_item', data);
		// Newly assigned to someone (not just edited): let them know
		const before = matchAssignee(parseAssignee(item.description).assignee, people);
		const after = matchAssignee(assignee, people);
		if (canAssign && after && after.entityId !== before?.entityId) notifyAssignee(summary, assignee, item.uid);
	};
	// Gone at once, deleted in Home Assistant once Undo has had its time (a deleted item can't come back)
	const remove = (targets: TodoItem[]) => {
		const uids = targets.map((item) => item.uid);
		setSelected([]);
		setRemoved((current) => [...current, ...uids]);
		// Sent when the toast goes without Undo, not on a timer of its own: the toast's pauses while
		// touched or hovered, and Undo once offered must still work
		let undone = false;
		let sent = false;
		for (const uid of uids) unsent.current.add(uid);
		const settle = () => {
			for (const uid of uids) unsent.current.delete(uid);
		};
		const send = () => {
			if (undone || sent) return;
			sent = true;
			settle();
			service('remove_item', { item: uids });
		};
		toast(`Deleted ${itemsLabel(targets)}`, {
			duration: UNDO_MS,
			onAutoClose: send,
			onDismiss: send,
			action: {
				label: 'Undo',
				onClick: () => {
					undone = true;
					settle();
					setRemoved((current) => current.filter((uid) => !uids.includes(uid)));
				},
			},
		});
	};
	const clearCompleted = () => {
		setRemoved((current) => [...current, ...completed.map((i) => i.uid)]);
		service('remove_completed_items');
	};

	// Drag to reorder (open items, on lists that can move them): the rows passed slide aside, and
	// letting go is one `todo/item/move` after the item now above it, shown at once
	const reorder = view === 'open' && todoSupports(list, TODO_FEATURE.MOVE);
	const dragDy = drag ? drag.y - drag.startY + drag.scroll - drag.startScroll : 0;
	const target = drag ? dragTargetAt(drag.tops, drag.heights, drag.from, dragDy) : -1;
	// A light tick as it's picked up and as it passes another
	useEffect(() => {
		if (target >= 0) hapticTap(6);
	}, [target]);
	// Held near the list's top or bottom edge: scroll that way, so an item can travel past what's shown
	useEffect(() => {
		const scroller = listRef.current;
		if (!drag || !scroller) return;
		const y = drag.y;
		const timer = setInterval(() => {
			const rect = scroller.getBoundingClientRect();
			const step = edgeScroll(y, rect.top, rect.bottom);
			if (!step) return;
			const before = scroller.scrollTop;
			scroller.scrollTop = before + step;
			const after = scroller.scrollTop;
			if (after !== before) setDrag((prev) => (prev ? { ...prev, scroll: after } : prev));
		}, 16);
		return () => clearInterval(timer);
	}, [drag?.uid, drag?.y]);
	const startDrag = (uid: string, e: React.PointerEvent<HTMLElement>) => {
		const scroller = listRef.current;
		const from = filtered.findIndex((item) => item.uid === uid);
		if (drag || !scroller || from < 0) return;
		e.preventDefault();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		const box = scroller.getBoundingClientRect();
		const rects = filtered.map((item) =>
			scroller.querySelector(`[data-uid="${CSS.escape(item.uid)}"]`)?.getBoundingClientRect(),
		);
		setDrag({
			uid,
			from,
			startY: e.clientY,
			y: e.clientY,
			startScroll: scroller.scrollTop,
			scroll: scroller.scrollTop,
			tops: rects.map((r) => (r ? r.top - box.top + scroller.scrollTop : 0)),
			heights: rects.map((r) => r?.height ?? 0),
		});
	};
	const moveDrag = (uid: string, y: number) => setDrag((prev) => (prev?.uid === uid ? { ...prev, y } : prev));
	const endDrag = (uid: string, cancelled: boolean) => {
		if (drag?.uid !== uid) return;
		const { from } = drag;
		const to = target;
		setDrag(null);
		if (!cancelled) moveTo(uid, from, to);
	};
	const step = (uid: string, by: number) => {
		const from = filtered.findIndex((item) => item.uid === uid);
		if (drag || from < 0) return;
		moveTo(uid, from, Math.max(0, Math.min(filtered.length - 1, from + by)));
		hapticTap(6);
	};
	const moveTo = (uid: string, from: number, to: number) => {
		if (to < 0 || to === from) return;
		// After the item now above it among those shown (none: to the top); hidden ones keep their places
		const visible = moveIndex(
			filtered.map((item) => item.uid),
			from,
			to,
		);
		const previous = to > 0 ? visible[to - 1] : null;
		setOrder(
			moveAfter(
				ordered.map((item) => item.uid),
				uid,
				previous,
			),
		);
		const item = filtered[from];
		const hass = getHass();
		if (!hass?.callWS) return;
		hass
			.callWS({
				type: 'todo/item/move',
				entity_id: list.entityId,
				uid,
				...(previous ? { previous_uid: previous } : {}),
			})
			.catch((err: Error) => {
				setOrder(null);
				toast.error(`Couldn't move ${item.summary}`, { description: err.message });
			});
	};

	// Every row's handlers, the same functions every render (above the early return: a hook)
	const handlers = useStableCallbacks<RowHandlers>({
		select: toggleSelected,
		longPress: (uid) => setSelected((current) => (current.includes(uid) ? current : [...current, uid])),
		toggle,
		// While selecting, a tap on a row picks it, as on a phone's own lists
		edit: (uid) => (picked.length > 0 ? toggleSelected(uid) : setEditing(uid)),
		remove: (item) => remove([item]),
		startDrag,
		moveDrag,
		endDrag,
		step,
	});
	const rowPeople = canAssign ? people : NO_PEOPLE;
	// The item being edited, as it is now (gone, deleted elsewhere: the dialog closes)
	const editingItem = (editing && shown.find((item) => item.uid === editing)) || null;
	const editDialog = (
		<EditItemDialog
			list={list}
			people={rowPeople}
			item={editingItem}
			onSave={save}
			onDelete={(item) => {
				setEditing(null);
				remove([item]);
			}}
			onClose={() => setEditing(null)}
		/>
	);
	const row = (item: TodoItem, index: number) => (
		<TodoRow
			key={item.uid}
			list={list}
			people={rowPeople}
			item={item}
			selected={selected.includes(item.uid)}
			focused={focused === item.uid}
			reorder={reorder}
			lifted={drag?.uid === item.uid}
			offset={
				drag
					? drag.uid === item.uid
						? dragDy
						: dragShift(index, drag.from, target, drag.heights[drag.from] + ROW_GAP_PX)
					: undefined
			}
			handlers={handlers}
		/>
	);

	const status = (
		<>
			{failed && (
				<EmptyState
					icon={<ListTodo className="short:hidden size-10" />}
					onRetry={retry}
					className="my-auto shrink-0 short:py-3"
				>
					Couldn't load {list.name}
				</EmptyState>
			)}
			{!loaded && !failed && (
				<p className="flex shrink-0 items-center gap-2 px-1 text-muted-foreground text-sm">
					<Loader2 className="size-4 animate-spin" />
					Loading…
				</p>
			)}
		</>
	);

	const canDelete = todoSupports(list, TODO_FEATURE.DELETE);
	const canUpdate = todoSupports(list, TODO_FEATURE.UPDATE);
	// Select all (or none), the count picked, and a way out of selecting
	const selectAllBox = visible.length > 0 && (
		<Checkbox
			size="xl"
			checked={picked.length === 0 ? false : picked.length === visible.length ? true : 'indeterminate'}
			onCheckedChange={selectAll}
			aria-label={picked.length === visible.length ? 'Deselect all' : 'Select all'}
		/>
	);
	const selecting = picked.length > 0 && (
		<>
			<span className="font-medium text-sm tabular-nums">
				<NumberFlow value={picked.length} /> selected
			</span>
			<Button variant="ghost" size="sm" onClick={() => setSelected([])} className="ml-auto">
				<X />
				Cancel
			</Button>
		</>
	);
	const bulk = (size: 'lg' | 'xl') =>
		picked.length > 0 && (
			<>
				{view === 'open' ? (
					<Button size={size} onClick={() => complete(picked)} disabled={!todoSupports(list, TODO_FEATURE.UPDATE)}>
						<Check />
						{shopping ? 'Got it' : 'Mark done'}
					</Button>
				) : (
					<Button
						variant="outline"
						size={size}
						onClick={() => reopen(picked)}
						disabled={!todoSupports(list, TODO_FEATURE.UPDATE)}
					>
						<Undo2 />
						Back on list
					</Button>
				)}
				{view === 'open' && canAssign && (
					<BulkAssign people={people} items={picked} onAssign={(assignee) => assign(picked, assignee)} />
				)}
				{view === 'open' && (withTime || todoSupports(list, TODO_FEATURE.SET_DUE_DATE)) && (
					<BulkDue items={picked} withTime={withTime} onApply={(due) => setDue(picked, due)} />
				)}
				{view === 'open' && size === 'xl' && (
					<PrintListButton
						list={list}
						uids={pickedUids}
						size="xl"
						groups={printGroups(picked)}
						anyone={generalUids(picked)}
						// A shopping list asks first, offering to check off what it prints
						markDone={shopping && canUpdate ? completePrinted(picked) : undefined}
					/>
				)}
				{canDelete && (
					<Button variant="destructive" size={size} onClick={() => remove(picked)}>
						<Trash2 />
						Delete
					</Button>
				)}
			</>
		);
	// The selection's actions take the add row's place on the dialog's bottom edge
	const bulkBar = picked.length > 0 && (
		<div className="mt-auto flex shrink-0 flex-wrap gap-2 *:flex-1">{bulk('xl')}</div>
	);

	if (view === 'completed') {
		const canClear = canDelete && completed.length > 0;
		const clear = canClear && (
			<ConfirmButton
				size={heading ? 'lg' : 'xl'}
				icon={<Trash2 />}
				label="Clear"
				confirmLabel="Tap to clear"
				onConfirm={clearCompleted}
			/>
		);
		const empty = loaded && completed.length === 0 && (
			<EmptyState icon={<CheckCheck className="short:hidden size-10" />} className="my-auto shrink-0 short:py-3">
				Nothing checked off on {list.name}
			</EmptyState>
		);
		if (heading) {
			return (
				<section className="flex shrink-0 flex-col gap-2">
					<div className="flex min-h-10 items-center gap-3 border border-transparent pl-3">
						{selectAllBox}
						<h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">{list.name}</h3>
						<div className="ml-auto flex items-center gap-2">
							{picked.length > 0 ? (
								<>
									<span className="font-medium text-sm tabular-nums">
										<NumberFlow value={picked.length} /> selected
									</span>
									{bulk('lg')}
								</>
							) : (
								clear
							)}
						</div>
					</div>
					{status}
					{empty}
					<ul className="flex flex-col gap-2">{completed.map(row)}</ul>
					{editDialog}
				</section>
			);
		}
		return (
			<div className="flex min-h-0 flex-1 flex-col gap-3">
				{selectAllBox && (
					<div className="flex min-h-11 shrink-0 items-center gap-3 border border-transparent pl-3">
						{selectAllBox}
						{selecting || <span className="text-muted-foreground text-sm">Select all</span>}
					</div>
				)}
				<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
					{status}
					{empty}
					<ul className="flex flex-col gap-2">{completed.map(row)}</ul>
				</div>
				{/* On phones, across the dialog's full width like every dialog's bottom buttons */}
				{bulkBar || (clear && <div className="mt-auto flex shrink-0 justify-end max-sm:*:flex-1">{clear}</div>)}
				{editDialog}
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			{/* Select all, then everything, general tasks, or one person's (with what's left for each), then
			    Print (with a printer); while some are selected, how many */}
			<div className="flex min-h-11 shrink-0 items-center gap-3 border border-transparent pl-3 empty:hidden">
				{selectAllBox}
				{selecting}
				{!selecting && canAssign && (
					<ChipRow role="radiogroup" aria-label="Show" className="min-w-0 flex-1">
						{[
							{ key: 'all', label: 'All' },
							{ key: 'anyone', label: 'Anyone' },
							...people.map((p) => ({ key: p.entityId, label: p.shortName, person: p })),
						].map(({ key, label, person }: { key: string; label: string; person?: PersonView }) => (
							<Button
								key={key}
								role="radio"
								aria-checked={filter === key}
								variant={filter === key ? 'default' : 'outline'}
								size="sm"
								onClick={() => pickFilter(key)}
								className={cn(person && 'pl-1.5')}
							>
								{person && <PersonAvatar person={person} className="size-5" />}
								{label}
								<span className="tabular-nums opacity-70">
									<NumberFlow value={openCount(key)} />
								</span>
							</Button>
						))}
					</ChipRow>
				)}
				{!selecting && !canAssign && selectAllBox && <span className="text-muted-foreground text-sm">Select all</span>}
				{!selecting && (
					<PrintListButton
						list={list}
						// Filtered to a person or general tasks: only what's shown
						uids={filter === 'all' ? undefined : filtered.map((item) => item.uid)}
						className="ml-auto shrink-0"
						groups={printGroups(filtered)}
						anyone={generalUids(filtered)}
						markDone={shopping && canUpdate ? completePrinted(filtered) : undefined}
					/>
				)}
			</div>

			<div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
				{loaded && filtered.length === 0 && (
					<EmptyState
						icon={
							<HolidayPeek
								className="short:hidden size-10"
								fallback={<CheckCheck className="short:hidden size-10" />}
							/>
						}
						className="my-auto shrink-0 short:py-3"
					>
						{filterPerson
							? `Nothing left for ${filterPerson.shortName}`
							: filter === 'anyone' && canAssign
								? 'No general tasks left'
								: `Nothing left on ${list.name}`}
					</EmptyState>
				)}
				{status}
				<ul className="flex flex-col gap-2">{filtered.map(row)}</ul>
			</div>

			{/* The add row sits on the dialog's bottom edge, like a message box */}
			{bulkBar}
			{!bulkBar && todoSupports(list, TODO_FEATURE.CREATE) && (
				<ItemForm
					list={list}
					people={canAssign ? people : []}
					defaultAssignee={filterPerson?.name}
					onSubmit={add}
					className="mt-auto shrink-0"
				/>
			)}
			{editDialog}
		</div>
	);
};

// The Checked off tab's value among the lists' entity ids (kept from when it was "Completed", so a
// device that remembers it still opens on it)
const COMPLETED_TAB = 'completed';

/**
 * Home Assistant's to-do lists (Chores, Shopping list, any other `todo.*`): a tab per list with its
 * open count, then a Checked off tab with what's done or bought on every list, each list in its own
 * section. The last tab picked is remembered per device. Items stay live while it's open.
 */
export const TodoDialog: React.FC<TodoDialogProps> = ({ isOpen, onClose, list: linkedList, focusItem, counts }) => {
	const lists = useTodoLists();
	const [picked, setPicked] = useState<string | null>(() => readStored(LIST_KEY));
	const showCompleted = picked === COMPLETED_TAB && lists.length > 0;
	const list = showCompleted ? undefined : (lists.find((l) => l.entityId === picked) ?? lists[0]);
	// What's left on a list: a household member's own and anyone's where that's known
	const openOn = (l: TodoList) => counts?.[l.entityId] ?? l.open;
	const total = lists.reduce((sum, l) => sum + openOn(l), 0);
	const tabs = lists.length + (lists.length > 0 ? 1 : 0);

	// A link names the list to open on
	useEffect(() => {
		if (isOpen && linkedList && lists.some((l) => l.entityId === linkedList)) setPicked(linkedList);
	}, [isOpen, linkedList, lists.length]);

	const pick = (value: string) => {
		setPicked(value);
		writeStored(LIST_KEY, value);
	};

	return (
		<Dialog open={isOpen} onOpenChange={(value) => !value && onClose()}>
			<DialogContent size="workspace">
				<DialogHeader>
					<DialogTitle>To-do</DialogTitle>
					<DialogDescription className="short:hidden">
						{lists.length === 0
							? 'No to-do lists in Home Assistant yet'
							: total === 0
								? lists.some((l) => l.open > 0)
									? 'Nothing left for you'
									: 'All done'
								: `${total} to do`}
					</DialogDescription>
				</DialogHeader>

				{tabs > 1 && (list || showCompleted) && (
					<Tabs value={showCompleted ? COMPLETED_TAB : list?.entityId} onValueChange={pick} className="shrink-0">
						<TabsList>
							{lists.map((l) => (
								<TabsTrigger key={l.entityId} value={l.entityId}>
									{openOn(l) > 0 ? `${l.name} · ${openOn(l)}` : l.name}
								</TabsTrigger>
							))}
							{lists.length > 0 && <TabsTrigger value={COMPLETED_TAB}>Checked off</TabsTrigger>}
						</TabsList>
					</Tabs>
				)}

				{list && (
					<TodoListView
						key={list.entityId}
						list={list}
						enabled={isOpen}
						view="open"
						focusItem={list.entityId === linkedList ? focusItem : undefined}
					/>
				)}
				{showCompleted &&
					(lists.length === 1 ? (
						<TodoListView key={`${lists[0].entityId}:completed`} list={lists[0]} enabled={isOpen} view="completed" />
					) : (
						<div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
							{lists.map((l) => (
								<TodoListView key={`${l.entityId}:completed`} list={l} enabled={isOpen} view="completed" heading />
							))}
						</div>
					))}
			</DialogContent>
		</Dialog>
	);
};
