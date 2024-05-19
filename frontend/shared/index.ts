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
	const l = theme === 'dark' ? 80 : 60;
	const c = theme === 'dark' ? 30 : 50;
	console.log(color_convert.lch.hex(l, c, h));
	return {
		hex: parseInt(color_convert.lch.hex(l, c, h), 16),
		css: `color: lch(${l}% ${c} ${h});`,
	};
}

export function normalize(s: string, trim?: boolean): string {
	if (trim === undefined) trim = true;
	let suffix = trim ? '' : s.match(/\s*$/)[0];
	s = s.normalize('NFD').replace(/ı/g, 'i').replace(/ȷ/g, 'j');
	let words = s.split(/\s+/gi).filter(_ => _);
	return (
		words
			.map(w =>
				w
					.replace(
						/(['ʼ‘’x-]*)([^aeiouq\u0300-\u036f'ʼ‘’0-9x]*)([aeiou])([\u0323]?)([\u0300-\u036f]?)([\u0323]?)([aeiou]*(?![\u0300-\u036f])q?)([0-8]*)(?=(-.)?)/gi,
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
							let abnormal = offset && tone !== '';
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
			.replace(/i/g, 'ı') + suffix
	);
}

export function color_for(name: string, theme?: string): Color {
	if (name === 'official') {
		if (theme === 'dark') {
			return { hex: 0xdddddd, css: '#ddd' };
		} else {
			return { hex: 0x333333, css: '#333' };
		}
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
	let el = document.createElement('p');
	el.innerText = s;
	return el.innerHTML;
}

function make_link(href: string, text: string): string {
	let el = document.createElement('a');
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
	let accum: string[] = [];
	const starters: RegExp[] = [
		plain_text ? /(<)(.*?)(>)/g : /(&lt;)(.*?)(&gt;)/g,
		...(still_editing ? [/([*]{2})(?!.*?[*]{2})(.*)()/g] : []),
		/([*]{2})(.*?)([*]{2})/g,
		/()(@[a-zA-Z]+)()/g,
		/()(#[0-9a-zA-Z_-]+)()/g,
		/(https?:\/\/)(\S+)()/g,
	];
	let matches = starters
		.flatMap(starter => [...content.matchAll(starter)])
		.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
	while (i < content.length && matches.length) {
		let nearestMatch = matches[0];
		let [all, start, cont, end] = nearestMatch;
		accum.push(content.substring(i, nearestMatch.index));
		i = (nearestMatch.index ?? 0) + all.length;
		let replacement;
		if (start == '**' && still_editing) {
			replacement = start + normalize(cont, !!end) + end;
		} else if (start.startsWith('http') && !still_editing) {
			replacement = make_link(all, cont.replace(/^www\.|\/$/g, ''));
		} else if (!plain_text && !still_editing) {
			let href = '#' + encodeURIComponent(cont);
			let style = cont.startsWith('@')
				? `style="${color_for(cont.substring(1), theme).css}"`
				: '';
			replacement = `<a href="${href}" ${style}>${cont}</a>`;
		} else {
			replacement = all;
		}
		accum.push(replacement);
		let catchUp: RegExpMatchArray;
		while ((catchUp = matches.shift())) {
			if (catchUp.index >= i) {
				matches.unshift(catchUp);
				break;
			}
		}
	}
	if (i < content.length) accum.push(content.substring(i));
	if (!plain_text && !still_editing)
		return accum.join('').replace(/\\(.)/g, '$1');
	else return accum.join('');
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
	let parts = query_string.split(/ /).map(a => {
		let parts = a.split(/\|/).map(b => {
			let negative, what;
			if ((negative = b[0] === '!')) b = b.substring(1);
			let parts = b.split(':');
			if (parts.length === 2) {
				if (parts[0] == 'order') {
					ordering = parts[1];
					return ['and'];
				} else
					what = [
						parts[0],
						parts[0] === 'arity' ? parseInt(parts[1], 10) || 0 : parts[1],
					];
			} else {
				parts = b.split(/(?=[\/@#=])/);
				let operations: [string, string | number][] = [];
				if (!parts[0].match(/^[\/@#=]/))
					operations.push(['term', parts.shift()]);
				for (let i = 0; i < parts.length; ++i) {
					let rest = parts[i].substring(1);
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
