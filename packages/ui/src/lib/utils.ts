/**
 * shadcn/ui's class name helper.
 *
 * @module
 */
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Class names joined (`clsx`'s conditionals), later Tailwind classes winning over earlier ones that clash. */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
