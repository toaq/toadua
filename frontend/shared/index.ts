import color_convert from 'color-convert';

export interface Note {
	date: string;
	user: string;
	content: string;
}

export interface Entry {
	id: string;
	date: string;
	head: string;
	body: string;
	user: string;
	scope: string;
	notes: Note[];
	score: number;

	uncollapsed?: boolean;
	vote?: number;
}

export interface Color {
	hex: number;
	css: string;
}

export function convert_hue(h: number, theme?: string): Color {
	const l = theme === 'dark' ? 80 : 40;
	const c = theme === 'dark' ? 40 : 60;
	return {
		hex: Number.parseInt(color_convert.lch.hex(l, c, h), 16),
		css: `color: lch(${l}% ${c} ${h});`,
	};
}

/**
 * Normalize Toaq text, e.g. turn `Vyadi hoi2 pai2` into `Ꝡadı hóı páı`.
 *
 * Beware! When Toadua starts up, this function gets called on everything in the
 * database (see modules/housekeep.ts). Changing its behavior might cause
 * widespread destruction.
 */
export function normalize(s: string, trim?: boolean): string {
	if (trim === undefined) trim = true;
	const suffix = trim ? '' : s.match(/\s*$/)[0];
	s = s.normalize('NFD').replace(/ı/g, 'i').replace(/ȷ/g, 'j');
	const words = s.split(/\s+/gi).filter(_ => _);
	return (
		words
			.map(w =>
				w
					.replace(
						// biome-ignore lint/suspicious/noMisleadingCharacterClass: We really do mean to have `aeiouq` and `\u0300-\u036f` in the same character class here.
						/(['ʼ‘’x-]*)([^aeiouq\u0300-\u036f'ʼ‘’0-9x]*)([aeiou])([\u0323]?)([\u0300-\u036f]?)([\u0323]?)([aeiou]*(?![\u0300-\u036f])(?:q|m(?![aeiou]))?)([0-8]*)(?=(-.)?)/gi,
						(
							_,
							_apo,
							initial,
							first,
							underdot1,
							tone,
							underdot2,
							rest,
							num,
							hyphen,
							offset,
						) => {
							if (tone === '\u0304' || tone === '\u0309') tone = '';
							if (num !== '' && num >= 2 && num <= 4)
								tone = ['\u0301', '\u0308', '\u0302'][num - 2];
							const abnormal = offset && tone !== '';
							return [
								abnormal && ' ',
								offset && !initial && !abnormal && "'",
								initial
									.replace(/^(V[Yy]?|[WY])$/, 'Ꝡ')
									.replace(/^(vy?|[wy])$/, 'ꝡ'),
								first,
								underdot1 || underdot2 || hyphen ? '\u0323' : '',
								tone,
								rest,
							]
								.filter(_ => _)
								.join('');
						},
					)
					.replace(/\u0323(?=.*?\u0323)/g, ''),
			)
			.join(' ')
			.normalize('NFC')
			.replace(/i/g, 'ı')
			.replace(/ị(?!\p{Diacritic})/gu, 'ı̣') + suffix
	);
}

export function color_for(name: string, theme?: string): Color {
	if (name === 'official') {
		if (theme === 'dark') {
			return { hex: 0xdddddd, css: '#ddd' };
		}
		return { hex: 0x333333, css: '#333' };
	}
	let n = 0;
	for (let i = 0, l = name.length; i < l; ++i)
		n = ((n << 5) - n + name.charCodeAt(i)) % 360;
	return convert_hue(n, theme);
}

export function score_color(n: number, theme?: string): Color {
	return convert_hue((Math.atan(n / 2) / Math.PI) * 2, theme);
}

export function score_number(n: number): string {
	return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±';
}

function escape(s: string): string {
	const el = document.createElement('p');
	el.innerText = s;
	return el.innerHTML;
}

function make_link(href: string, text: string): string {
	const el = document.createElement('a');
	el.innerText = text;
	el.setAttribute('href', href);
	return el.outerHTML;
}

export function replacements(
	content: string,
	still_editing: boolean,
	plain_text: boolean,
	theme?: string,
): string {
	content = plain_text ? content : escape(content);
	content = content.replace(/___/g, '▯');
	let i = 0;
	const accum: string[] = [];
	const starters: RegExp[] = [
		plain_text ? /(<)(.*?)(>)/g : /(&lt;)(.*?)(&gt;)/g,
		...(still_editing ? [/([*]{2})(?!.*?[*]{2})(.*)()/g] : []),
		/([*]{2})(.*?)([*]{2})/g,
		/()(@[a-zA-Z]+)()/g,
		/()(#[0-9a-zA-Z_-]+)()/g,
		/(https?:\/\/)(\S*[\w\/])()/g,
	];
	const matches = starters
		.flatMap(starter => [...content.matchAll(starter)])
		.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
	while (i < content.length && matches.length) {
		const nearestMatch = matches[0];
		const [all, start, cont, end] = nearestMatch;
		accum.push(content.substring(i, nearestMatch.index));
		i = (nearestMatch.index ?? 0) + all.length;
		let replacement: string;
		if (start === '**' && still_editing) {
			replacement = start + normalize(cont, !!end) + end;
		} else if (start.startsWith('http') && !still_editing) {
			replacement = make_link(all, cont.replace(/^www\.|\/$/g, ''));
		} else if (!plain_text && !still_editing) {
			const href = `#${encodeURIComponent(cont)}`;
			const style = cont.startsWith('@')
				? `style="${color_for(cont.substring(1), theme).css}"`
				: '';
			replacement = `<a href="${href}" ${style}>${cont}</a>`;
		} else {
			replacement = all;
		}
		accum.push(replacement);
		let catchUp: RegExpExecArray;
		// biome-ignore lint/suspicious/noAssignInExpressions: it's idiomatic enough in a while loop
		while ((catchUp = matches.shift())) {
			if (catchUp.index >= i) {
				matches.unshift(catchUp);
				break;
			}
		}
	}
	if (i < content.length) accum.push(content.substring(i));
	return accum.join('');
}

const character_operators = {
	'/': 'arity',
	'@': 'user',
	'#': 'id',
	'=': 'head',
};

export function parse_query(query_string: string): {
	query: any;
	ordering: string | undefined;
} {
	let ordering: string | undefined;
	const parts = query_string.split(/ /).map(a => {
		const parts = a.split(/\|/).map(b => {
			let negative;
			let what;
			if ((negative = b[0] === '!')) b = b.substring(1);
			let parts = b.split(':');
			if (parts.length === 2) {
				if (parts[0] === 'order') {
					ordering = parts[1];
					return ['and'];
				} else
					what = [
						parts[0],
						['arity', 'myvote'].includes(parts[0])
							? parseInt(parts[1], 10) || 0
							: parts[1],
					];
			} else {
				parts = b.split(/(?=[\/@#=])/);
				const operations: [string, string | number][] = [];
				if (!parts[0].match(/^[\/@#=]/))
					operations.push(['term', parts.shift()]);
				for (let i = 0; i < parts.length; ++i) {
					const rest = parts[i].substring(1);
					operations.push([
						character_operators[parts[i][0]],
						parts[i][0] === '/' ? parseInt(rest, 10) || 0 : rest,
					]);
				}
				what = operations.length > 1 ? ['and', ...operations] : operations[0];
			}
			return negative ? ['not', what] : what;
		});
		if (parts.length > 1) return ['or'].concat(parts);
		else return parts[0];
	});
	let query;
	if (parts.length > 1) query = ['and'].concat(parts);
	else query = parts[0];
	return { query, ordering };
}
