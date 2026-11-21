import type React from 'preact/compat';
import { cn } from '../../lib/utils';

/**
 * A thin ring in a light's color around its control (several colors blend around it, for a scene),
 * turning slowly while an effect runs. Drawn behind the child (which keeps its size), with a gap in
 * the card's color, so rows don't move when lights change. Without colors or an effect it's just the child.
 */
export const ColorRing: React.FC<{
	colors: string[];
	effect?: boolean;
	children: React.ReactNode;
	className?: string;
}> = ({ colors, effect = false, children, className }) => {
	const shown = colors.length > 0 ? colors : effect ? ['var(--muted-foreground)'] : [];
	// A running effect gets a gap in the ring, so its turning shows even with one color
	const stops = effect ? [...shown, 'transparent', shown[0]] : shown.length > 1 ? [...shown, shown[0]] : shown;
	const ring = stops.length > 1 ? `conic-gradient(${stops.join(', ')})` : stops[0];
	return (
		<span className={cn('relative isolate inline-flex shrink-0 rounded-md', className)}>
			{ring && (
				<>
					{/* The gradient turns inside a clipped ring (@property can't animate in a ShadowRoot) */}
					<span aria-hidden className="absolute -inset-1 -z-20 overflow-hidden rounded-[calc(var(--radius)+2px)]">
						<span
							style={{ background: ring }}
							className={cn('absolute -inset-1/2', effect && 'animate-ring-spin motion-reduce:animate-none')}
						/>
					</span>
					<span aria-hidden className="absolute -inset-0.5 -z-10 rounded-(--radius) bg-card" />
				</>
			)}
			{children}
		</span>
	);
};
