import type React from 'preact/compat';
import { cn } from '../../lib/utils';
import { themeStyle } from '../../themes/css';
import type { DashboardTheme } from '../../themes/tokens';

/**
 * A dashboard in miniature, drawn in `theme`'s own colors: the page, a card with a line of text,
 * and a primary button (with the theme's gradient edge and glow, when it has them).
 */
export const ThemePreview: React.FC<{ theme: DashboardTheme; mode: 'light' | 'dark'; className?: string }> = ({
	theme,
	mode,
	className,
}) => {
	const effects = !!theme.effects?.gradient;
	return (
		<div
			style={themeStyle(theme, mode)}
			className={cn('flex flex-col gap-1.5 rounded-md border bg-background p-2 text-foreground', className)}
			aria-hidden="true"
		>
			<div className="flex flex-col gap-1.5 rounded-sm border bg-card p-2">
				<div className="h-1.5 w-3/5 rounded-full bg-foreground/80" />
				<div className="h-1.5 w-2/5 rounded-full bg-muted-foreground/60" />
				<div className="flex items-center gap-1.5 pt-1">
					<div
						className={cn('relative h-4 w-10 rounded-sm bg-primary', effects && 'theme-preview-edge')}
						data-glow={theme.effects?.glow ? '' : undefined}
					/>
					<div className="h-4 w-6 rounded-sm border bg-secondary" />
					<div className="ml-auto size-2 rounded-full bg-success" />
				</div>
			</div>
		</div>
	);
};
