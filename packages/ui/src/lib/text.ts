// Short words that stay lowercase inside a title ("Someone Is at the Door")
const MINOR_WORDS = new Set([
	'a',
	'an',
	'and',
	'as',
	'at',
	'but',
	'by',
	'for',
	'in',
	'nor',
	'of',
	'on',
	'or',
	'the',
	'to',
	'via',
	'vs',
]);

/**
 * Title case ("Front Door opened" → "Front Door Opened", "Snack on the way" → "Snack on the Way"):
 * every word's first letter capitalized but the minor words inside, and nothing ever lowercased,
 * so names keep their own spelling ("WiiM", "TV").
 */
export function titleCase(text: string): string {
	const words = text.split(' ');
	const last = words.length - 1;
	return words
		.map((word, i) =>
			i > 0 && i < last && MINOR_WORDS.has(word) ? word : word.replace(/^\p{Ll}/u, (c) => c.toUpperCase()),
		)
		.join(' ');
}

/** "Sam", "Sam and Alex", "Sam, Alex and Jo". */
export function nameList(names: readonly string[]): string {
	if (names.length <= 1) return names[0] ?? '';
	return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The first letter capitalized, the rest kept ("heat_cool" → "Heat_cool", "person" → "Person"). */
export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
