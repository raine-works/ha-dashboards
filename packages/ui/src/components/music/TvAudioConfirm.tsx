import { Music, Tv } from 'lucide-react';
import type React from 'preact/compat';
import { useSyncExternalStore } from 'preact/compat';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui';

/** A play waiting on the person's say-so: the speaker that's playing its TV's sound, and the answer. */
interface Pending {
	speaker: string;
	/** "Joining" a group rather than playing on it. */
	join: boolean;
	resolve: (confirmed: boolean) => void;
}

// One question for the page at a time (a store outside the tree, so any control can ask)
let pending: Pending | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};
const settle = (confirmed: boolean) => {
	const current = pending;
	pending = null;
	for (const listener of listeners) listener();
	current?.resolve(confirmed);
};

/**
 * Ask before music takes over a speaker that's playing its TV's sound (a soundbar on its TV input):
 * playing there, moving music there or joining it to a group cuts off whoever is watching. Resolves
 * true for "Play anyway"; a newer question cancels an older one.
 */
export function confirmTvTakeover(speaker: string, { join = false } = {}): Promise<boolean> {
	pending?.resolve(false);
	return new Promise((resolve) => {
		pending = { speaker, join, resolve };
		for (const listener of listeners) listener();
	});
}

/** The question itself, mounted once per page by `definePanelElement`. */
export const TvAudioConfirm: React.FC = () => {
	const current = useSyncExternalStore(subscribe, () => pending);
	return (
		<Dialog open={!!current} onOpenChange={(open) => !open && settle(false)}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Tv className="size-5 shrink-0 text-primary" />
						{current?.speaker} Is Playing the TV
					</DialogTitle>
					<DialogDescription>
						{current?.join ? 'Joining it to the group' : 'Playing music here'} cuts off the TV's sound for anyone
						watching
					</DialogDescription>
				</DialogHeader>
				{/* One row, equal widths when there's room, like the bedtime confirms */}
				<DialogFooter className="flex-row">
					<Button variant="outline" size="xl" onClick={() => settle(false)} className="flex-1">
						Cancel
					</Button>
					<Button size="xl" onClick={() => settle(true)} className="flex-1">
						<Music />
						{current?.join ? 'Join anyway' : 'Play anyway'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
