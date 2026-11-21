import { RefreshCw, TriangleAlert } from 'lucide-react';
import React, { Component } from 'preact/compat';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

/** A crashed part tries again on its own after this long (the entity that broke it may have recovered). */
export const ERROR_RETRY_MS = 30_000;

export interface ErrorBoundaryProps {
	/** What crashed, for the message and the log ("Lighting", "Cameras"). */
	name: string;
	/**
	 * How the fallback looks: `section` a card filling its place, `inline` a line of text (inside a
	 * dialog), `page` the whole dashboard.
	 */
	variant?: 'section' | 'inline' | 'page';
	/** Wraps the fallback (e.g. in a dialog's content, so a crashed dialog can still be closed). */
	frame?: (fallback: React.ReactNode) => React.ReactNode;
	/** Retry on its own after this many ms; 0 waits for a tap. */
	retryMs?: number;
	className?: string;
	children: React.ReactNode;
}

interface ErrorBoundaryState {
	error: unknown;
	/** Bumped on retry, so the children mount fresh. */
	attempt: number;
}

/**
 * Keeps one part's crash (a render error, e.g. an entity shaped unlike the code expects) from
 * unmounting the whole dashboard: the part shows what broke and a Try again button, and retries on its
 * own after `retryMs`. Without it, one throw blanks the wall panel until its nightly reload.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	state: ErrorBoundaryState = { error: null, attempt: 0 };
	private _timer: ReturnType<typeof setTimeout> | undefined;

	static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
		return { error: error ?? new Error('Unknown error') };
	}

	componentDidCatch(error: unknown) {
		console.error(`[${this.props.name}] crashed:`, error);
		const retryMs = this.props.retryMs ?? ERROR_RETRY_MS;
		clearTimeout(this._timer);
		if (retryMs > 0) this._timer = setTimeout(this.retry, retryMs);
	}

	componentWillUnmount() {
		clearTimeout(this._timer);
	}

	retry = () => {
		clearTimeout(this._timer);
		this.setState(({ attempt }) => ({ error: null, attempt: attempt + 1 }));
	};

	render() {
		const { name, variant = 'section', className, frame, children } = this.props;
		const { error, attempt } = this.state;
		if (!error) return <React.Fragment key={attempt}>{children}</React.Fragment>;

		const message = error instanceof Error ? error.message : String(error);
		const fallback = (
			<div
				role="alert"
				className={cn(
					'flex flex-col items-center justify-center gap-3 text-center',
					variant === 'section' && 'h-full min-h-40 rounded-xl border bg-card p-6 text-card-foreground',
					variant === 'page' && 'size-full min-h-60 bg-background p-6 text-foreground',
					variant === 'inline' && 'p-4',
					className,
				)}
			>
				<TriangleAlert className="size-8 text-warning" />
				<div className="flex flex-col gap-1">
					<p className="font-semibold">{name} hit a problem</p>
					<p className="wrap-break-word line-clamp-3 max-w-md text-muted-foreground text-sm">{message}</p>
				</div>
				<Button variant="outline" onClick={this.retry}>
					<RefreshCw />
					Try again
				</Button>
			</div>
		);
		return frame ? frame(fallback) : fallback;
	}
}

/** `Component` inside an ErrorBoundary named `name` (for exported sections, so every panel gets it). */
export function withErrorBoundary<P extends object>(
	Inner: React.ComponentType<P>,
	name: string,
	variant: ErrorBoundaryProps['variant'] = 'section',
): React.FC<P> {
	const Wrapped: React.FC<P> = (props) => (
		<ErrorBoundary name={name} variant={variant}>
			<Inner {...props} />
		</ErrorBoundary>
	);
	Wrapped.displayName = `WithErrorBoundary(${name})`;
	return Wrapped;
}
