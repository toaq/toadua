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
								initial.replace(/V[Yy]?|[WY]/, 'Ꝡ').replace(/vy?|[wy]/, 'ꝡ'),
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
