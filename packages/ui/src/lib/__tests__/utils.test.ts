import { describe, expect, it } from 'bun:test';
import { cn } from '../utils';

describe('cn', () => {
	it('keeps a type size beside a text color (the design scale is a size, not a color)', () => {
		expect(cn('text-caption', 'text-muted-foreground')).toBe('text-caption text-muted-foreground');
		expect(cn('truncate text-caption touch:text-sm', 'text-warning')).toBe(
			'truncate text-caption touch:text-sm text-warning',
		);
		expect(cn('text-title', 'text-foreground/80')).toBe('text-title text-foreground/80');
	});

	it('lets a later size, radius or padding replace the design tokens', () => {
		expect(cn('text-caption', 'text-sm')).toBe('text-sm');
		expect(cn('text-body', 'text-title')).toBe('text-title');
		expect(cn('rounded-tile', 'rounded-control')).toBe('rounded-control');
		expect(cn('rounded-tile', 'rounded-none')).toBe('rounded-none');
		expect(cn('p-pad', 'p-4')).toBe('p-4');
		expect(cn('gap-gap', 'gap-2')).toBe('gap-2');
	});

	it('still merges what it always did', () => {
		expect(cn('px-2', 'px-4')).toBe('px-4');
		expect(cn('text-muted-foreground', 'text-warning')).toBe('text-warning');
	});
});
