import { describe, expect, it } from 'bun:test';
import { parseInline, parseMarkdown } from '../markdown';

describe('parseInline', () => {
	it('splits emphasis, code and links into spans', () => {
		expect(parseInline('Set **Kitchen** to *warm* with `light.turn_on`, see [docs](https://x.y)')).toEqual([
			{ type: 'text', text: 'Set ' },
			{ type: 'strong', text: 'Kitchen' },
			{ type: 'text', text: ' to ' },
			{ type: 'em', text: 'warm' },
			{ type: 'text', text: ' with ' },
			{ type: 'code', text: 'light.turn_on' },
			{ type: 'text', text: ', see docs' },
		]);
	});

	it('leaves snake_case names, lone asterisks and math alone', () => {
		expect(parseInline('light.kitchen_main_light is on')).toEqual([
			{ type: 'text', text: 'light.kitchen_main_light is on' },
		]);
		expect(parseInline('2 * 3 * 4 = 24')).toEqual([{ type: 'text', text: '2 * 3 * 4 = 24' }]);
	});

	it('reads __strong__ and _em_ at word edges', () => {
		expect(parseInline('__Note:__ it is _very_ cold')).toEqual([
			{ type: 'strong', text: 'Note:' },
			{ type: 'text', text: ' it is ' },
			{ type: 'em', text: 'very' },
			{ type: 'text', text: ' cold' },
		]);
	});
});

describe('parseMarkdown', () => {
	it('reads an agent answer: a paragraph, then a numbered list', () => {
		const blocks = parseMarkdown(
			'Here are three facts:\n\n1. The Moon is the **fifth** largest moon.\n2. It has no atmosphere.\n3. Its surface is covered in craters.',
		);
		expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'list']);
		expect(blocks[1]).toMatchObject({ type: 'list', ordered: true, start: 1 });
		expect(blocks[1].type === 'list' && blocks[1].items.length).toBe(3);
	});

	it('joins wrapped lines into one paragraph and splits on blank lines', () => {
		const blocks = parseMarkdown('The lights\nare on.\n\nThe door is locked.');
		expect(blocks).toEqual([
			{ type: 'paragraph', spans: [{ type: 'text', text: 'The lights are on.' }] },
			{ type: 'paragraph', spans: [{ type: 'text', text: 'The door is locked.' }] },
		]);
	});

	it('reads bullets, headings, code blocks and a paragraph straight after a list', () => {
		const blocks = parseMarkdown(
			'## Lights on\n- Kitchen\n* Hallway\n  (both floors)\nThat is all.\n```\nlight.turn_on\n```',
		);
		expect(blocks).toEqual([
			{ type: 'heading', spans: [{ type: 'text', text: 'Lights on' }] },
			{
				type: 'list',
				ordered: false,
				start: 1,
				items: [[{ type: 'text', text: 'Kitchen' }], [{ type: 'text', text: 'Hallway (both floors)' }]],
			},
			{ type: 'paragraph', spans: [{ type: 'text', text: 'That is all.' }] },
			{ type: 'code', text: 'light.turn_on' },
		]);
	});

	it('keeps a list numbered from where it starts', () => {
		expect(parseMarkdown('3. Third\n4. Fourth')[0]).toMatchObject({ type: 'list', ordered: true, start: 3 });
	});

	it('is empty for nothing', () => {
		expect(parseMarkdown('  \n\n')).toEqual([]);
	});
});
