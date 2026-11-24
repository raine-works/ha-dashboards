/**
 * The Messages dialog's quick messages, by category: shared by its Speakers, Phones and Notes tabs.
 *
 * @module
 */

import type React from 'preact/compat';
import { useEffect, useState } from 'preact/compat';
import type { PresetCategory } from '../../lib/intercom';
import { readStored, writeStored } from '../../lib/storage';
import { Button, ChipRow } from '../ui';

/**
 * The intercom's quick messages: a row of category chips (scrolling sideways, like any ChipRow)
 * over the picked category's messages, which wrap and scroll inside the space the column leaves,
 * so the message box under them stays put. The category is remembered per device.
 */
export function PresetPicker<T>({
	title,
	categories,
	storageKey,
	children,
}: {
	title: string;
	categories: PresetCategory<T>[];
	storageKey: string;
	children: (preset: T) => React.ReactNode;
}) {
	// A featured category (a holiday's) opens first; else the last pick on this device
	const [picked, setPicked] = useState(() => categories.find((c) => c.featured)?.id ?? readStored(storageKey));
	const category = categories.find((c) => c.id === picked) ?? categories[0];

	useEffect(() => {
		if (picked) writeStored(storageKey, picked);
	}, [picked, storageKey]);

	return (
		// The chips take the space the column leaves and scroll inside it, two rows of them at least (the title,
		// the categories and two rows: 172px, 200px with a wall panel's taller chips), so they never draw over
		// what's under them; below that the column scrolls
		<div className="grid min-h-43 touch:min-h-50 flex-1 grid-rows-[auto_auto_minmax(0,1fr)] gap-3 max-md:flex-none">
			<span className="font-medium text-sm">{title}</span>
			<ChipRow role="radiogroup" aria-label={`${title} category`} className="shrink-0">
				{categories.map((c) => (
					<Button
						key={c.id}
						type="button"
						role="radio"
						aria-checked={c === category}
						variant={c === category ? 'default' : 'outline'}
						size="sm"
						onClick={() => setPicked(c.id)}
					>
						{c.label}
					</Button>
				))}
			</ChipRow>
			<div className="-m-1 flex min-h-0 flex-wrap content-start gap-2 overflow-y-auto p-1">
				{category?.presets.map(children)}
			</div>
		</div>
	);
}
