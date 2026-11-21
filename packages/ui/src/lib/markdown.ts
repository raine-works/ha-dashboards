// The Markdown that conversation agents answer with (paragraphs, lists, emphasis, inline code,
// headings, the odd code block), parsed into blocks and spans for rendering as elements. Never
// HTML: an answer can't inject markup. Links keep only their text (the panels never navigate away).

export type MarkdownSpan = { type: 'text' | 'strong' | 'em' | 'code'; text: string };

export type MarkdownBlock =
	| { type: 'paragraph'; spans: MarkdownSpan[] }
	| { type: 'heading'; spans: MarkdownSpan[] }
	| { type: 'list'; ordered: boolean; start: number; items: MarkdownSpan[][] }
	| { type: 'code'; text: string };

// One inline mark per alternative: **strong** / __strong__, `code`, [link](url), *em* / _em_
// (underscores only at word edges, so snake_case names survive)
const INLINE =
	/(\*\*|__)(?=\S)(.+?)(?<=\S)\1|`([^`\n]+)`|!?\[([^\]]*)\]\([^)\s]*\)|\*(?=[^\s*])([^*\n]+?)(?<=\S)\*|(?<![\w])_(?=\S)([^_\n]+?)(?<=\S)_(?![\w])/g;

/** A line's inline marks as spans (adjacent text merged). */
export function parseInline(text: string): MarkdownSpan[] {
	const spans: MarkdownSpan[] = [];
	const push = (type: MarkdownSpan['type'], value: string) => {
		if (!value) return;
		const last = spans[spans.length - 1];
		if (type === 'text' && last?.type === 'text') last.text += value;
		else spans.push({ type, text: value });
	};
	let at = 0;
	for (const match of text.matchAll(INLINE)) {
		push('text', text.slice(at, match.index));
		const [, , strong, code, link, starEm, underscoreEm] = match;
		if (strong !== undefined) push('strong', strong);
		else if (code !== undefined) push('code', code);
		else if (link !== undefined) push('text', link);
		else push('em', starEm ?? underscoreEm ?? '');
		at = (match.index ?? 0) + match[0].length;
	}
	push('text', text.slice(at));
	return spans;
}

const BULLET = /^\s*[-*+•]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;

/** Markdown into blocks: a blank line ends a paragraph, a line break inside one is a space. */
export function parseMarkdown(markdown: string): MarkdownBlock[] {
	const blocks: MarkdownBlock[] = [];
	let paragraph: string[] = [];
	let list: { ordered: boolean; start: number; items: string[] } | null = null;
	let code: string[] | null = null;

	const flush = () => {
		if (paragraph.length) blocks.push({ type: 'paragraph', spans: parseInline(paragraph.join(' ')) });
		paragraph = [];
		if (list)
			blocks.push({ type: 'list', ordered: list.ordered, start: list.start, items: list.items.map(parseInline) });
		list = null;
	};

	for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
		if (code) {
			if (FENCE.test(line)) {
				blocks.push({ type: 'code', text: code.join('\n') });
				code = null;
			} else code.push(line);
			continue;
		}
		if (FENCE.test(line)) {
			flush();
			code = [];
			continue;
		}
		if (!line.trim() || RULE.test(line)) {
			flush();
			continue;
		}
		const heading = HEADING.exec(line);
		if (heading) {
			flush();
			blocks.push({ type: 'heading', spans: parseInline(heading[1]) });
			continue;
		}
		const bullet = BULLET.exec(line);
		const numbered = bullet ? null : NUMBERED.exec(line);
		if (bullet || numbered) {
			const ordered = !!numbered;
			if (paragraph.length || (list && list.ordered !== ordered)) flush();
			if (!list) list = { ordered, start: numbered ? Number(numbered[1]) : 1, items: [] };
			list.items.push((bullet?.[1] ?? numbered?.[2] ?? '').trim());
			continue;
		}
		// An indented line under a list item continues it; anything else is paragraph text
		const text = line.trim().replace(/^>\s?/, '');
		if (list && /^\s/.test(line)) list.items[list.items.length - 1] += ` ${text}`;
		else {
			if (list) flush();
			paragraph.push(text);
		}
	}
	if (code) blocks.push({ type: 'code', text: (code as string[]).join('\n') });
	flush();
	return blocks;
}
