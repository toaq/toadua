const {
	hsl: { hex: hsl_to_hex },
} = require('color-convert');

export interface Color {
	hex: number;
	css: string;
}

export function convert_hue(n: number): Color {
	return {
		hex: parseInt(hsl_to_hex(n, 100, 30), 16),
		css: `color: hsl(${n}, 100%, 30%);`,
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
				w.replace(
					/(['\u02bc\u2018\u2019x-]*)([^aeiouyq\u0300-\u036f'\u02bc\u2018\u20190-9x-]*)([aeiouy])([\u0300-\u036f]?)([aeiouy]*(?![\u0300-\u036f])q?)([0-8]*)/gi,
					(_, _apo, initial, first, tone, rest, num, offset) => {
						if (tone === '\u0304') tone = '';
						if (num)
							tone = [
								'',
								'',
								'\u0301',
								'\u0308',
								'\u0309',
								'\u0302',
								'\u0300',
								'\u0303',
								'',
							][num];
						let abnormal = offset && tone !== '';
						return [
							abnormal && ' ',
							offset && !initial && !abnormal && "'",
							initial,
							first,
							tone,
							rest,
						]
							.filter(_ => _)
							.join('');
					},
				),
			)
			.join(' ')
			.normalize('NFC')
			.replace(/i/g, 'ı') + suffix
	);
}

export function color_for(name: string): Color {
	if (name === 'official') return { hex: 0x333333, css: '#333' };
	let n = 0;
	for (let i = 0, l = name.length; i < l; ++i)
		n = ((n << 5) - n + name.charCodeAt(i)) % 360;
	return convert_hue(n);
}

export function score_color(n: number): Color {
	return convert_hue((Math.atan(n / 2) / Math.PI) * 2);
}

export function score_number(n: number): string {
	return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±';
}
