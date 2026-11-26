/** The Home dashboard's Music page. */

import { MusicPlayer } from '@app/ui/music';
import { Music } from 'lucide-react';
import type React from 'preact/compat';

/** The Music Assistant player as a page. */
export const MusicView: React.FC = () => (
	<div className="flex flex-col gap-4">
		<div className="flex items-center gap-3 px-2">
			<Music className="size-6 shrink-0 text-muted-foreground" />
			<div className="min-w-0">
				<h2 className="truncate font-semibold text-lg leading-tight">Music</h2>
				<p className="truncate text-muted-foreground text-sm">Music Assistant on every speaker in the house</p>
			</div>
		</div>
		<MusicPlayer />
	</div>
);
