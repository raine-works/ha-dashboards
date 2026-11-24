/**
 * shadcn/ui's Avatar (new-york v4), ported to Preact without Radix: the fallback shows while the
 * image is missing or fails to load.
 *
 * @module
 */

import React, { useEffect, useState } from 'preact/compat';
import { cn } from '../../lib/utils';

interface AvatarContextValue {
	imageFailed: boolean;
	setImageFailed: (failed: boolean) => void;
}

const AvatarContext = React.createContext<AvatarContextValue>({
	imageFailed: false,
	setImageFailed: () => {},
});

/** A round avatar holding an `AvatarImage` and an `AvatarFallback`. */
const Avatar = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
	({ className, children, ...props }, ref) => {
		const [imageFailed, setImageFailed] = useState(false);

		return (
			<span
				ref={ref}
				data-slot="avatar"
				className={cn('relative flex size-8 shrink-0 overflow-hidden rounded-full', className)}
				{...props}
			>
				<AvatarContext.Provider value={{ imageFailed, setImageFailed }}>{children}</AvatarContext.Provider>
			</span>
		);
	},
);
Avatar.displayName = 'Avatar';

/** The avatar's picture; renders nothing without a `src` or once it fails to load. */
const AvatarImage = React.forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>(
	({ className, src, alt = '', ...props }, ref) => {
		const { imageFailed, setImageFailed } = React.useContext(AvatarContext);

		useEffect(() => {
			setImageFailed(!src);
		}, [src]);

		if (!src || imageFailed) return null;

		return (
			<img
				ref={ref}
				src={src}
				alt={alt}
				data-slot="avatar-image"
				className={cn('aspect-square size-full object-cover', className)}
				onError={() => setImageFailed(true)}
				{...props}
			/>
		);
	},
);
AvatarImage.displayName = 'AvatarImage';

/** What shows (initials, an icon) while the avatar has no picture. */
const AvatarFallback = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
	({ className, ...props }, ref) => {
		const { imageFailed } = React.useContext(AvatarContext);
		if (!imageFailed) return null;

		return (
			<span
				ref={ref}
				data-slot="avatar-fallback"
				className={cn('flex size-full items-center justify-center rounded-full bg-muted', className)}
				{...props}
			/>
		);
	},
);
AvatarFallback.displayName = 'AvatarFallback';

export { Avatar, AvatarFallback, AvatarImage };
