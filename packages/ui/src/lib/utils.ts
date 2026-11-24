/**
 * shadcn/ui's class name helper, taught the design's own tokens.
 *
 * @module
 */
import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge, told about theme.css's own scales (docs/design/shape-space-type.md). Without them it
 * reads `text-caption` as a text color, so a color after it (`text-muted-foreground`) dropped the size;
 * and `rounded-tile` or `p-pad` would never give way to a caller's override.
 */
const twMerge = extendTailwindMerge({
	extend: {
		theme: {
			text: ['overline', 'caption', 'label', 'body', 'title', 'heading', 'figure', 'display'],
			radius: ['chip', 'control', 'control-lg', 'icon', 'tile', 'dialog'],
			spacing: ['pad', 'gap'],
		},
	},
});

/** Class names joined (`clsx`'s conditionals), later Tailwind classes winning over earlier ones that clash. */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
