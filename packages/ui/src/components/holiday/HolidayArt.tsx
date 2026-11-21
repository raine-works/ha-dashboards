import type React from 'preact/compat';
import type { CharacterId } from '../../lib/holidays';
import { cn } from '../../lib/utils';

// The holidays' characters (loaded on demand: `HolidayCharacter` in HolidayEgg.tsx): hand-drawn on a 32px grid in one style (a mid-tone fill with a 1.5px
// outline a shade darker, so they read on the light and the dark theme alike; the same dark ink
// eyes and smile, rosy cheeks), readable from 16px up. The idle motion (`holiday-bob` and friends in
// theme.css) stands still for reduced motion.

const INK = '#292524';
const BLUSH = '#fb7185';
const stroke = { strokeWidth: 1.5, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;

/** Two dark eyes with a glint, a smile and rosy cheeks, centered on (x, y). */
const Face: React.FC<{ x?: number; y: number; spread?: number; eye?: number; cheeks?: boolean; smile?: string }> = ({
	x = 16,
	y,
	spread = 3.4,
	eye = 1.15,
	cheeks = true,
	smile = INK,
}) => (
	<g>
		{cheeks && (
			<>
				<ellipse cx={x - spread - 1.4} cy={y + 2} rx={1.3} ry={0.8} fill={BLUSH} opacity={0.7} />
				<ellipse cx={x + spread + 1.4} cy={y + 2} rx={1.3} ry={0.8} fill={BLUSH} opacity={0.7} />
			</>
		)}
		<circle cx={x - spread} cy={y} r={eye} fill={INK} />
		<circle cx={x + spread} cy={y} r={eye} fill={INK} />
		<circle cx={x - spread + 0.4} cy={y - 0.4} r={eye * 0.35} fill="#fff" />
		<circle cx={x + spread + 0.4} cy={y - 0.4} r={eye * 0.35} fill="#fff" />
		<path d={`M${x - 1.8} ${y + 1.9}q1.8 1.7 3.6 0`} fill="none" stroke={smile} {...stroke} strokeWidth={1.3} />
	</g>
);

/** A four-pointed twinkle centered on (x, y). */
const Sparkle: React.FC<{ x: number; y: number; r: number; fill: string; delay?: string }> = ({
	x,
	y,
	r,
	fill,
	delay,
}) => (
	<path
		className="holiday-twinkle"
		style={delay ? { animationDelay: delay } : undefined}
		d={`M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`}
		fill={fill}
	/>
);

const Pumpkin = () => (
	<>
		<path d="M16 8.6c-.2-2.2.4-3.9 2.1-5" fill="none" stroke="#15803d" {...stroke} strokeWidth={2.4} />
		<path d="M17.6 5.2c1.6-1.4 3.6-1.4 4.9-.4-1.3 1.4-3.3 1.6-4.9.4Z" fill="#4ade80" stroke="#15803d" {...stroke} />
		<path
			d="M16 9c-2.2-1.3-5.2-1.3-7.6.1C5.1 10.9 3.5 14.2 3.5 18.3c0 5.5 4.8 9.4 12.5 9.4s12.5-3.9 12.5-9.4c0-4.1-1.6-7.4-4.9-9.2C21.2 7.7 18.2 7.7 16 9Z"
			fill="#fb923c"
			stroke="#c2410c"
			{...stroke}
		/>
		<path
			d="M10.2 9.6c-2.4 3.6-2.4 13.6 0 17.6M21.8 9.6c2.4 3.6 2.4 13.6 0 17.6"
			fill="none"
			stroke="#ea580c"
			{...stroke}
		/>
		<path
			d="M9.6 16.4l2.3-3.3 2.3 3.3ZM17.8 16.4l2.3-3.3 2.3 3.3Z"
			fill={INK}
			stroke={INK}
			{...stroke}
			strokeWidth={0.8}
		/>
		<path d="M10.4 19.2h11.2a5.6 4.2 0 0 1-11.2 0Z" fill={INK} stroke={INK} {...stroke} strokeWidth={0.8} />
		<path d="M14.9 19.2h2.2v1.6h-2.2Z" fill="#fb923c" />
	</>
);

const FEATHERS = [
	{ angle: -72, fill: '#facc15', stroke: '#ca8a04' },
	{ angle: -48, fill: '#fb923c', stroke: '#c2410c' },
	{ angle: -24, fill: '#f87171', stroke: '#b91c1c' },
	{ angle: 0, fill: '#facc15', stroke: '#ca8a04' },
	{ angle: 24, fill: '#f87171', stroke: '#b91c1c' },
	{ angle: 48, fill: '#fb923c', stroke: '#c2410c' },
	{ angle: 72, fill: '#facc15', stroke: '#ca8a04' },
];

const Turkey = () => (
	<>
		{FEATHERS.map(({ angle, fill, stroke: edge }) => (
			<ellipse
				key={angle}
				cx={16}
				cy={8.6}
				rx={3.4}
				ry={7}
				transform={`rotate(${angle} 16 19)`}
				fill={fill}
				stroke={edge}
				{...stroke}
			/>
		))}
		<path d="M13.4 27.4v2M18.6 27.4v2" fill="none" stroke="#d97706" {...stroke} strokeWidth={1.6} />
		<path
			d="M16 9.6c3 0 5.2 2.4 5.2 5.3 0 1 .6 1.8 1.4 2.8 1 1.3 1.6 2.7 1.6 4.3 0 3.5-3.7 6.1-8.2 6.1s-8.2-2.6-8.2-6.1c0-1.6.6-3 1.6-4.3.8-1 1.4-1.8 1.4-2.8 0-2.9 2.2-5.3 5.2-5.3Z"
			fill="#c2773a"
			stroke="#7c2d12"
			{...stroke}
		/>
		<Face y={14.2} spread={2.2} eye={1} cheeks={false} smile="transparent" />
		<path d="M14.6 16.1h2.8L16 18.2Z" fill="#fbbf24" stroke="#b45309" {...stroke} strokeWidth={1} />
		<path
			d="M17.1 17.3c1 .6 1.2 2.1.3 2.7-.8-.4-.9-1.7-.3-2.7Z"
			fill="#ef4444"
			stroke="#b91c1c"
			{...stroke}
			strokeWidth={0.8}
		/>
		<ellipse cx={11.6} cy={20.6} rx={1.3} ry={0.8} fill={BLUSH} opacity={0.7} />
		<ellipse cx={20.4} cy={20.6} rx={1.3} ry={0.8} fill={BLUSH} opacity={0.7} />
	</>
);

const Gingerbread = () => (
	<>
		<path
			d="M12 14.5h8l6.5 1.4c1.7.4 1.7 2.7 0 3.1l-5.4 1 2.2 6.6c.4 1.2-.5 2.4-1.8 2.4h-1c-.8 0-1.4-.5-1.6-1.2L16 23.4l-2.9 4.4c-.2.7-.8 1.2-1.6 1.2h-1c-1.3 0-2.2-1.2-1.8-2.4l2.2-6.6-5.4-1c-1.7-.4-1.7-2.7 0-3.1Z"
			fill="#c2773a"
			stroke="#7c2d12"
			{...stroke}
		/>
		<circle cx={16} cy={9.2} r={5.6} fill="#c2773a" stroke="#7c2d12" {...stroke} />
		<path d="M13.2 13.2h5.6v2.4h-5.6Z" fill="#c2773a" />
		<path
			d="M25 16.3c.4.6.4 1.4 0 2M7 16.3c-.4.6-.4 1.4 0 2M19.9 26.6c.6.4 1.5.4 2.1 0M10 26.6c.6.4 1.5.4 2.1 0"
			fill="none"
			stroke="#fff"
			{...stroke}
			strokeWidth={1.1}
		/>
		<circle cx={16} cy={17.4} r={1.1} fill="#ef4444" />
		<circle cx={16} cy={20.6} r={1.1} fill="#22c55e" />
		<Face y={8.6} spread={2.2} eye={1} smile="#fff" />
	</>
);

const PartyFace = () => (
	<>
		<circle cx={16} cy={19} r={9.5} fill="#facc15" stroke="#ca8a04" {...stroke} />
		<path d="M16 2.8l5.4 8.9c-3.4 1.5-7.4 1.5-10.8 0Z" fill="#c084fc" stroke="#7e22ce" {...stroke} />
		<path d="M13.6 7.4h4.8M12.2 9.8h7.6" fill="none" stroke="#fde047" {...stroke} strokeWidth={1.1} />
		<circle cx={16} cy={2.8} r={1.7} fill="#f472b6" stroke="#be185d" {...stroke} strokeWidth={1} />
		<path d="M11.4 18.2q1.3-1.4 2.6 0M18 18.2q1.3-1.4 2.6 0" fill="none" stroke={INK} {...stroke} strokeWidth={1.3} />
		<path d="M13.2 21.2h5.6a2.8 2.6 0 0 1-5.6 0Z" fill={INK} stroke={INK} {...stroke} strokeWidth={0.8} />
		<ellipse cx={10.6} cy={21.2} rx={1.3} ry={0.8} fill={BLUSH} opacity={0.8} />
		<ellipse cx={21.4} cy={21.2} rx={1.3} ry={0.8} fill={BLUSH} opacity={0.8} />
		<Sparkle x={5} y={7} r={3} fill="#f59e0b" />
		<Sparkle x={27} y={9.5} r={2.4} fill="#ec4899" delay="0.6s" />
		<Sparkle x={27.5} y={26.5} r={2} fill="#8b5cf6" delay="1.2s" />
	</>
);

const Star = () => (
	<>
		<Sparkle x={4.5} y={5} r={2.6} fill="#ef4444" />
		<Sparkle x={27.5} y={4.5} r={2.2} fill="#ef4444" delay="0.7s" />
		<path
			d="M16 4.5L20 12L28.4 13.5L22.5 19.6L23.6 28L16 24.3L8.4 28L9.5 19.6L3.6 13.5L12 12Z"
			fill="#60a5fa"
			stroke="#1d4ed8"
			{...stroke}
		/>
		<Face y={16.4} spread={2.6} />
	</>
);

const Heart = () => (
	<>
		<path
			d="M16 27.5C9 22.6 3.5 18 3.5 11.8 3.5 8 6.4 5 10 5c2.5 0 4.6 1.4 6 3.5C17.4 6.4 19.5 5 22 5c3.6 0 6.5 3 6.5 6.8 0 6.2-5.5 10.8-12.5 15.7Z"
			fill="#fb7185"
			stroke="#be123c"
			{...stroke}
		/>
		<path d="M7.4 10.2c.3-1.4 1.3-2.4 2.6-2.6" fill="none" stroke="#fff" {...stroke} strokeWidth={1.3} opacity={0.8} />
		<Face y={14.2} cheeks={false} />
		<ellipse cx={10.8} cy={16.4} rx={1.3} ry={0.8} fill="#be123c" opacity={0.45} />
		<ellipse cx={21.2} cy={16.4} rx={1.3} ry={0.8} fill="#be123c" opacity={0.45} />
	</>
);

const LEAF =
	'M16 15.6C13.6 13.8 10.5 11.8 10.5 9 10.5 7 12 5.6 13.6 5.6c1.1 0 1.9.6 2.4 1.5.5-.9 1.3-1.5 2.4-1.5 1.6 0 3.1 1.4 3.1 3.4 0 2.8-3.1 4.8-5.5 6.6Z';

const Clover = () => (
	<>
		<path d="M17 18.5c.8 4.2 2.8 7.4 6 9.7" fill="none" stroke="#15803d" {...stroke} strokeWidth={2.4} />
		{[0, 90, 180, 270].map((angle) => (
			<path key={angle} d={LEAF} transform={`rotate(${angle} 16 15.6)`} fill="#4ade80" stroke="#15803d" {...stroke} />
		))}
		<circle cx={16} cy={15.6} r={4.6} fill="#4ade80" />
		<Face y={15} spread={2.2} eye={1} cheeks={false} />
	</>
);

const BunnyEgg = () => (
	<>
		<g fill="#c4b5fd" stroke="#6d28d9" {...stroke}>
			<ellipse cx={12} cy={8.5} rx={2.7} ry={6.4} transform="rotate(-14 12 8.5)" />
			<ellipse cx={20} cy={8.5} rx={2.7} ry={6.4} transform="rotate(14 20 8.5)" />
		</g>
		<ellipse cx={12} cy={8.6} rx={1.1} ry={4} transform="rotate(-14 12 8.6)" fill="#f9a8d4" />
		<ellipse cx={20} cy={8.6} rx={1.1} ry={4} transform="rotate(14 20 8.6)" fill="#f9a8d4" />
		<path
			d="M16 9.5c4.8 0 8.6 6.4 8.6 11.4 0 4.6-3.8 8-8.6 8s-8.6-3.4-8.6-8c0-5 3.8-11.4 8.6-11.4Z"
			fill="#c4b5fd"
			stroke="#6d28d9"
			{...stroke}
		/>
		<path
			d="M8 23.4l2-1.5 2 1.5 2-1.5 2 1.5 2-1.5 2 1.5 2-1.5 2 1.5"
			fill="none"
			stroke="#f59e0b"
			{...stroke}
			strokeWidth={1.4}
		/>
		<Face y={17.4} spread={2.8} />
	</>
);

const Flower = () => (
	<>
		<path d="M16 19v10" fill="none" stroke="#15803d" {...stroke} strokeWidth={2} />
		<path d="M16 26.4c-2.8.2-4.9-1.3-5.6-3.6 2.8-.2 4.9 1 5.6 3.6Z" fill="#4ade80" stroke="#15803d" {...stroke} />
		<g fill="#f9a8d4" stroke="#be185d" {...stroke}>
			{[0, 60, 120, 180, 240, 300].map((angle) => (
				<circle key={angle} cx={16} cy={6.2} r={4.2} transform={`rotate(${angle} 16 12.4)`} />
			))}
		</g>
		<circle cx={16} cy={12.4} r={5.2} fill="#fde047" stroke="#ca8a04" {...stroke} />
		<Face y={11.8} spread={2.1} eye={0.95} cheeks={false} />
	</>
);

const Necktie = () => (
	<>
		<path d="M9.5 3.5l6.5 2.4 6.5-2.4-1 4-5.5 1.4-5.5-1.4Z" fill="#e5e7eb" stroke="#6b7280" {...stroke} />
		<path d="M12.6 4.6h6.8l-1.3 4.4h-4.2Z" fill="#60a5fa" stroke="#1d4ed8" {...stroke} />
		<path d="M13.9 9h4.2l4.4 14.2L16 29.5l-6.5-6.3Z" fill="#60a5fa" stroke="#1d4ed8" {...stroke} />
		<path d="M11.4 25l9.4-6.2M13.6 27.6l8-5.4" fill="none" stroke="#1d4ed8" {...stroke} opacity={0.45} />
		<circle cx={14.2} cy={14} r={1} fill={INK} />
		<circle cx={17.8} cy={14} r={1} fill={INK} />
		<circle cx={14.5} cy={13.6} r={0.35} fill="#fff" />
		<circle cx={18.1} cy={13.6} r={0.35} fill="#fff" />
		<path
			d="M16 17c-1-.9-2.6-1.1-3.6-.2-.6.5-1.1.5-1.6 0 .3 1.6 1.9 2.4 3.4 1.9.8-.3 1.4-.8 1.8-1.3.4.5 1 1 1.8 1.3 1.5.5 3.1-.3 3.4-1.9-.5.5-1 .5-1.6 0-1-.9-2.6-.7-3.6.2Z"
			fill="#57534e"
			stroke={INK}
			{...stroke}
			strokeWidth={0.8}
		/>
	</>
);

const Cupcake = () => (
	<>
		<Sparkle x={5.5} y={6} r={1.8} fill="#facc15" />
		<Sparkle x={26.5} y={8.5} r={1.4} fill="#f472b6" delay="0.6s" />
		<path
			className="holiday-twinkle"
			d="M16 1.8c1.6 1.8 2.1 3.2 1.4 4.3-.6 1-2.2 1-2.8 0-.7-1.1-.2-2.5 1.4-4.3Z"
			fill="#facc15"
			stroke="#ea580c"
			{...stroke}
			strokeWidth={1}
		/>
		<path d="M14.9 7.6h2.2v4.4h-2.2Z" fill="#93c5fd" stroke="#2563eb" {...stroke} strokeWidth={1} />
		<path
			d="M7 18.6c-2 0-2.9-2.1-1.6-3.5 1-1.1 2.4-1.6 3.6-1.4.7-1.7 2.5-2.7 4.4-2.3.7-.4 1.6-.6 2.6-.6s1.9.2 2.6.6c1.9-.4 3.7.6 4.4 2.3 1.2-.2 2.6.3 3.6 1.4 1.3 1.4.4 3.5-1.6 3.5Z"
			fill="#f9a8d4"
			stroke="#db2777"
			{...stroke}
		/>
		<path
			d="M10.5 14.6l1.2-.5M15 13.2l.6 1M19.6 14.4l1.1.4M13 16.6l.9-.7M22.4 16.6l.8.5M8.4 16.4l.6.6"
			fill="none"
			stroke="#7c3aed"
			{...stroke}
			strokeWidth={1}
		/>
		<path d="M6.6 18.6h18.8l-2.1 9.9H8.7Z" fill="#c4b5fd" stroke="#7c3aed" {...stroke} />
		<path d="M11.2 19.4l.8 8.4M16 19.4v8.4M20.8 19.4l-.8 8.4" fill="none" stroke="#7c3aed" {...stroke} opacity={0.4} />
		<Face y={22.4} spread={3.2} eye={1.05} />
	</>
);

const ART: Record<CharacterId, { draw: React.FC; idle: string }> = {
	birthday: { draw: Cupcake, idle: 'holiday-bob' },
	'new-year': { draw: PartyFace, idle: 'holiday-bob' },
	valentines: { draw: Heart, idle: 'holiday-beat' },
	'st-patricks': { draw: Clover, idle: 'holiday-wiggle' },
	easter: { draw: BunnyEgg, idle: 'holiday-bob' },
	'mothers-day': { draw: Flower, idle: 'holiday-wiggle' },
	'fathers-day': { draw: Necktie, idle: 'holiday-wiggle' },
	'independence-day': { draw: Star, idle: 'holiday-bob' },
	halloween: { draw: Pumpkin, idle: 'holiday-wiggle' },
	thanksgiving: { draw: Turkey, idle: 'holiday-bob' },
	christmas: { draw: Gingerbread, idle: 'holiday-wiggle' },
};

/**
 * A holiday's character, or a birthday's (a cupcake). `animated` gives it its idle motion (a bob, a wiggle, a heartbeat; the
 * sparkles twinkle either way unless motion is reduced).
 */
export const HolidayArt: React.FC<{ id: CharacterId; animated?: boolean; className?: string }> = ({
	id,
	animated = false,
	className,
}) => {
	const { draw: Draw, idle } = ART[id];
	return (
		<svg
			viewBox="0 0 32 32"
			aria-hidden="true"
			data-holiday={id}
			className={cn('holiday-character shrink-0 overflow-visible', animated && idle, className)}
		>
			<Draw />
		</svg>
	);
};

export default HolidayArt;
