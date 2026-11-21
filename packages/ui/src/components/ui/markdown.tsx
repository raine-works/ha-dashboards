// Panel extension (not shadcn): renders the Markdown subset `lib/markdown.ts` parses, as elements
// (never HTML), in the surrounding text's color and size.

import type React from 'preact/compat';
import { type MarkdownSpan, parseMarkdown } from '../../lib/markdown';
import { cn } from '../../lib/utils';

const Spans: React.FC<{ spans: MarkdownSpan[] }> = ({ spans }) => (
	<>
		{spans.map((span, i) => {
			const key = `${i}-${span.type}`;
			if (span.type === 'strong')
				return (
					<strong key={key} className="font-semibold">
						{span.text}
					</strong>
				);
			if (span.type === 'em') return <em key={key}>{span.text}</em>;
			if (span.type === 'code')
				return (
					<code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.875em]">
						{span.text}
					</code>
				);
			return <span key={key}>{span.text}</span>;
		})}
	</>
);

/** Markdown (paragraphs, lists, emphasis, inline code, headings, code blocks) as spaced blocks. */
export function Markdown({ text, className }: { text: string; className?: string }) {
	const blocks = parseMarkdown(text);
	return (
		<div data-slot="markdown" className={cn('wrap-break-word flex flex-col gap-2.5', className)}>
			{blocks.map((block, i) => {
				const key = `${i}-${block.type}`;
				switch (block.type) {
					case 'heading':
						return (
							<p key={key} className="font-semibold">
								<Spans spans={block.spans} />
							</p>
						);
					case 'list': {
						const List = block.ordered ? 'ol' : 'ul';
						return (
							<List
								key={key}
								start={block.ordered && block.start !== 1 ? block.start : undefined}
								className={cn(
									'flex flex-col gap-1.5 pl-5 marker:text-muted-foreground',
									block.ordered ? 'list-decimal' : 'list-disc',
								)}
							>
								{block.items.map((item, j) => (
									<li key={`${j}-${item.length}`} className="pl-1">
										<Spans spans={item} />
									</li>
								))}
							</List>
						);
					}
					case 'code':
						return (
							<pre key={key} className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-[0.875em]">
								{block.text}
							</pre>
						);
					default:
						return (
							<p key={key}>
								<Spans spans={block.spans} />
							</p>
						);
				}
			})}
		</div>
	);
}
