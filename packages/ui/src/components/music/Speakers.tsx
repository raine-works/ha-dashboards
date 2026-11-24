/**
 * The speakers: the list to pick from, a volume slider, and the Speakers tab (grouping and each
 * speaker's volume).
 *
 * @module
 */

import { Link, Speaker, Unlink, Volume2 } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/compat';
import { useHeldValue } from '../../hooks/useHeldValue';
import {
	groupFollowers,
	groupVolume,
	hasMedia,
	joinableSpeakers,
	MEDIA_FEATURE,
	type MusicPlayer as Player,
	supports,
} from '../../lib/music';
import { cn } from '../../lib/utils';
import { Button, Card, Slider, SwitchRow } from '../ui';
import { Artwork, PlayingBars, playerArtIcon } from './Artwork';
import type { MusicControls } from './useMusic';

/** "Playing", "Paused", "Idle", "Off", or "With Kitchen" for a group follower. */
function playerStatus(player: Player, players: Player[], state: Player['state'], starting = false): string {
	if (player.leader) return `With ${players.find((p) => p.entityId === player.leader)?.name ?? 'group'}`;
	if (state === 'unavailable') return 'Unavailable';
	if (state === 'playing') return player.title ?? 'Playing';
	if (starting) return 'Starting…';
	// A pause shows as idle on these speakers; the track stays loaded
	if (hasMedia({ ...player, state })) return `Paused · ${player.title}`;
	if (state === 'paused') return 'Paused';
	return state === 'off' ? 'Off' : 'Idle';
}

/** Every speaker with what it plays; picking one shows it in the player. */
export const SpeakerList: React.FC<{
	players: Player[];
	selected: string;
	onSelect: (id: string) => void;
	controls: MusicControls;
	className?: string;
}> = ({ players, selected, onSelect, controls, className }) => {
	const navRef = useRef<HTMLElement>(null);
	// Phones: bring the picked speaker into the strip (horizontally only, never scrolling the page)
	useEffect(() => {
		const nav = navRef.current;
		const button = nav?.querySelector<HTMLElement>('[aria-pressed="true"]');
		if (!nav || !button || nav.scrollWidth <= nav.clientWidth) return;
		nav.scrollTo({ left: button.offsetLeft - nav.offsetLeft - (nav.clientWidth - button.offsetWidth) / 2 });
	}, [selected]);

	return (
		// Phones: a strip to swipe through; wider screens: a column
		<nav
			ref={navRef}
			aria-label="Speakers"
			className={cn(
				'flex shrink-0 gap-2 overflow-x-auto p-0.5 max-md:-mx-1 max-md:px-1 md:w-60 md:flex-col md:overflow-x-visible',
				className,
			)}
		>
			{players.map((player) => {
				const state = controls.stateOf(player);
				const source = players.find((p) => p.entityId === player.leader) ?? player;
				const grouped = player.groupMembers.length > 0 && !player.leader;
				return (
					<button
						key={player.entityId}
						type="button"
						aria-pressed={player.entityId === selected}
						onClick={() => onSelect(player.entityId)}
						className="flex min-w-0 shrink-0 items-center gap-3 rounded-lg border p-2 text-left transition-colors hover:bg-accent aria-pressed:border-primary aria-pressed:bg-accent max-md:w-48"
					>
						<div className="relative shrink-0">
							<Artwork
								src={hasMedia(source) ? source.artwork : undefined}
								fallback={hasMedia(source) ? playerArtIcon(source) : Speaker}
								className="size-10"
							/>
							{controls.stateOf(source) === 'playing' && (
								<span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/45 text-white">
									<PlayingBars />
								</span>
							)}
						</div>
						<div className="flex min-w-0 flex-1 flex-col">
							<span className="flex items-center gap-1.5 font-semibold text-sm">
								<span className="truncate">{player.name}</span>
								{grouped && (
									<span className="shrink-0 text-muted-foreground text-xs">+{player.groupMembers.length - 1}</span>
								)}
							</span>
							<span className="truncate text-muted-foreground text-xs">
								{playerStatus(player, players, state, controls.isStarting(player))}
							</span>
						</div>
					</button>
				);
			})}
		</nav>
	);
};

/** A volume slider that shows the drag position, then the set volume until Home Assistant reports it. */
export const VolumeSlider: React.FC<{
	value: number;
	onCommit: (value: number) => void;
	label: string;
	disabled?: boolean;
	/** The percentage's box (it sits after the slider). */
	valueClassName?: string;
	className?: string;
}> = ({ value, onCommit, label, disabled, valueClassName = 'min-w-10 text-right', className }) => {
	const shown = useHeldValue(value, (held, reported) => Math.abs(held - reported) <= 1);
	return (
		<div className={cn('flex items-center gap-3', className)}>
			<Slider
				min={0}
				max={100}
				value={shown.value}
				disabled={disabled}
				onValueChange={shown.hold}
				onValueCommit={(v) => {
					shown.commit(v);
					onCommit(v);
				}}
				aria-label={label}
			/>
			<span className={cn('font-mono text-muted-foreground text-xs tabular-nums', valueClassName)}>{shown.value}%</span>
		</div>
	);
};

/** `record` without `keys`. */
const without = (record: Record<string, boolean>, keys: string[]) =>
	Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));

/**
 * Where the music plays: a switch per speaker to add it to (or drop it from) the group around
 * `leader`, the group volume, and each grouped speaker's own volume.
 */
export const SpeakersPanel: React.FC<{ leader: Player; players: Player[]; controls: MusicControls }> = ({
	leader,
	players,
	controls,
}) => {
	const [pending, setPending] = useState<Record<string, boolean>>({});
	// Drop each pending change once Home Assistant reports it (only that one: speakers report a group
	// change one at a time, and the others' switches must hold until theirs comes)
	const membersKey = leader.groupMembers.join(',');
	useEffect(() => {
		setPending((prev) => {
			const reported = Object.keys(prev).filter((id) => leader.groupMembers.includes(id) === prev[id]);
			return reported.length > 0 ? without(prev, reported) : prev;
		});
	}, [membersKey]);

	const inGroup = (id: string) => pending[id] ?? leader.groupMembers.includes(id);
	// Done (or given up on): the switches show what the speakers report again, so a join that failed
	// or never came doesn't stay on
	const settle = (...ids: string[]) => setPending((prev) => (ids.some((id) => id in prev) ? without(prev, ids) : prev));
	// A speaker playing its TV's sound can join a group (asking first) but not lead one
	const canGroup = supports(leader, MEDIA_FEATURE.GROUPING) && !leader.tvAudio;
	const rows = [
		leader,
		...players.filter((p) => p.entityId !== leader.entityId && canGroup && supports(p, MEDIA_FEATURE.GROUPING)),
	];
	const members = rows.filter((p) => p.entityId === leader.entityId || inGroup(p.entityId));
	const followers = groupFollowers(players);
	const joinable = joinableSpeakers(leader, players).filter((id) => !inGroup(id));

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center gap-3">
				<p className="min-w-48 flex-1 text-muted-foreground text-sm">
					{canGroup
						? `Turn on the speakers that should play along with ${leader.name}, in sync.`
						: leader.tvAudio
							? `${leader.name} is playing the TV, so other speakers can't play along with it.`
							: `${leader.name} can't play along with other speakers.`}
				</p>
				{/* Every speaker into this group at once */}
				{joinable.length > 0 && (
					<Button
						variant="outline"
						size="lg"
						onClick={() => {
							setPending((prev) => ({ ...prev, ...Object.fromEntries(joinable.map((id) => [id, true])) }));
							controls.joinAll(leader, joinable).then(() => settle(...joinable));
						}}
						loading={controls.isJoiningAll()}
						className="shrink-0"
					>
						<Link />
						Join all
					</Button>
				)}
				{/* Any group anywhere: split them all at once */}
				{followers.length > 0 && (
					<Button
						variant="outline"
						size="lg"
						onClick={() => {
							const members = leader.groupMembers;
							setPending(Object.fromEntries(members.map((id) => [id, false])));
							controls.ungroupAll(followers).then(() => settle(...members));
						}}
						loading={controls.isUngroupingAll()}
						className="shrink-0"
					>
						<Unlink />
						Ungroup all
					</Button>
				)}
			</div>

			{members.length > 1 && (
				<Card className="gap-3 p-4">
					<div className="flex items-center gap-2 font-semibold text-sm">
						<Volume2 className="size-4 text-muted-foreground" />
						Group volume
					</div>
					<VolumeSlider
						value={groupVolume(members.map((m) => m.volume))}
						onCommit={(v) => controls.setGroupVolume(members, v)}
						label="Group volume"
					/>
				</Card>
			)}

			<Card className="gap-0 py-1">
				{rows.map((player, i) => {
					const isLeader = player.entityId === leader.entityId;
					const on = isLeader || inGroup(player.entityId);
					const elsewhere = !isLeader && !on && player.leader && player.leader !== leader.entityId;
					let status = 'Not playing along';
					if (isLeader) status = hasMedia(leader) ? 'Playing the music' : 'Plays what you pick';
					else if (elsewhere)
						status = `With ${players.find((p) => p.entityId === player.leader)?.name ?? 'another speaker'}`;
					else if (on) status = 'Playing along';
					// Music Assistant takes a moment to (un)group: say so until the speaker reports it
					const grouping = !isLeader && controls.isGrouping(player.entityId);
					if (grouping) status = on ? 'Joining…' : 'Leaving…';
					const info = (
						<>
							<Speaker className={cn('size-5 shrink-0', on ? 'text-foreground' : 'text-muted-foreground')} />
							<div className="flex min-w-0 flex-1 flex-col">
								<span className="truncate font-semibold">{player.name}</span>
								<span className={cn('truncate text-muted-foreground text-xs', grouping && 'animate-pulse')}>
									{status}
								</span>
							</div>
						</>
					);
					return (
						<div key={player.entityId} className={cn('flex flex-col', i > 0 && 'border-t')}>
							{isLeader ? (
								<div className="flex items-center gap-3 px-4 py-3">{info}</div>
							) : (
								// The whole row toggles playing along (the volume slider below stays separate)
								<SwitchRow
									checked={on}
									onCheckedChange={(checked) => {
										setPending((prev) => ({ ...prev, [player.entityId]: checked }));
										(checked ? controls.join(leader, player.entityId) : controls.unjoin(player.entityId)).then(() =>
											settle(player.entityId),
										);
									}}
									aria-label={`Play on ${player.name}`}
									className="px-4 py-3"
								>
									{info}
								</SwitchRow>
							)}
							{on && supports(player, MEDIA_FEATURE.VOLUME_SET) && (
								<VolumeSlider
									value={player.volume}
									onCommit={(v) => controls.setVolume(player, v)}
									label={`${player.name} volume`}
									className="pr-4 pb-3 pl-12"
								/>
							)}
						</div>
					);
				})}
			</Card>
		</div>
	);
};
