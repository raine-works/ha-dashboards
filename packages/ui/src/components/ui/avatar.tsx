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
