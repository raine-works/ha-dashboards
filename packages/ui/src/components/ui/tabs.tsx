/**
 * shadcn/ui's Tabs (new-york v4), ported to Preact without Radix (same markup, `role`s and
 * `data-state`), a size up on wall panels.
 *
 * @module
 */

import React, { useState } from 'preact/compat';
import { cn } from '../../lib/utils';

interface TabsContextValue {
	value: string;
	onValueChange: (val: string) => void;
}

const TabsContext = React.createContext<TabsContextValue>({
	value: '',
	onValueChange: () => {},
});

/** A div's attributes and the tab shown: controlled (`value`) or not (`defaultValue`). */
export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
	/** The tab shown at first (uncontrolled). */
	defaultValue?: string;
	/** The tab shown (controlled). */
	value?: string;
	/** A tab was picked: its value. */
	onValueChange?: (value: string) => void;
}

/** Tabs: a `TabsList` of `TabsTrigger`s, and a `TabsContent` for each. */
const Tabs: React.FC<TabsProps> = ({
	defaultValue,
	value: controlledValue,
	onValueChange,
	className,
	children,
	...props
}) => {
	const [internalValue, setInternalValue] = useState(defaultValue || '');
	const value = controlledValue !== undefined ? controlledValue : internalValue;

	const handleValueChange = (val: string) => {
		if (controlledValue === undefined) {
			setInternalValue(val);
		}
		onValueChange?.(val);
	};

	return (
		<TabsContext.Provider value={{ value, onValueChange: handleValueChange }}>
			<div data-slot="tabs" className={cn('flex flex-col gap-2', className)} {...props}>
				{children}
			</div>
		</TabsContext.Provider>
	);
};

/** The row of tabs (`role="tablist"`). */
const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
	({ className, ...props }, ref) => (
		<div
			ref={ref}
			role="tablist"
			data-slot="tabs-list"
			className={cn(
				'inline-flex h-9 touch:h-13 w-fit items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground',
				className,
			)}
			{...props}
		/>
	),
);
TabsList.displayName = 'TabsList';

/** A button's attributes and the tab it shows. */
export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	/** The `TabsContent` it shows. */
	value: string;
}

/** A tab (`role="tab"`), raised while its content shows. */
const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(({ className, value, ...props }, ref) => {
	const context = React.useContext(TabsContext);
	const isActive = context.value === value;

	return (
		<button
			ref={ref}
			type="button"
			role="tab"
			aria-selected={isActive}
			data-slot="tabs-trigger"
			data-state={isActive ? 'active' : 'inactive'}
			onClick={() => context.onValueChange(value)}
			className={cn(
				"inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-2 touch:px-3 py-1 font-medium text-foreground text-sm touch:text-base transition-[color,box-shadow] focus-visible:border-ring focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:shadow-sm dark:text-muted-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className,
			)}
			{...props}
		/>
	);
});
TabsTrigger.displayName = 'TabsTrigger';

/** A div's attributes and the tab it belongs to. */
export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
	/** The `TabsTrigger` that shows it. */
	value: string;
}

/** A tab's content (`role="tabpanel"`), rendered only while its tab is picked. */
const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
	({ className, value, children, ...props }, ref) => {
		const context = React.useContext(TabsContext);
		if (context.value !== value) return null;

		return (
			<div
				ref={ref}
				role="tabpanel"
				data-slot="tabs-content"
				className={cn('flex-1 outline-none', className)}
				{...props}
			>
				{children}
			</div>
		);
	},
);
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsContent, TabsList, TabsTrigger };
