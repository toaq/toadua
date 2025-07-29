import { test, describe, expect } from 'vitest';
import { normalize } from './index.js';

describe('normalize', () => {
	test('it normalizes Toaq text', () => {
		expect(normalize('Vyadi hoi2 pai2 ȷibo1')).toMatchInlineSnapshot(
			`"Ꝡadı hóı páı jıbo"`,
		);
		expect(normalize('domu')).toMatchInlineSnapshot(`"domu"`);
		expect(normalize("o'aomo")).toMatchInlineSnapshot(`"o'aomo"`);
		expect(normalize('daqmiq')).toMatchInlineSnapshot(`"daqmıq"`);
		expect(normalize('koammoa')).toMatchInlineSnapshot(`"koammoa"`);
		expect(normalize("'amla")).toMatchInlineSnapshot(`"amla"`);
		expect(normalize('chuom’ai')).toMatchInlineSnapshot(`"chuom'aı"`);
		expect(normalize('ram-jea ji2')).toMatchInlineSnapshot(`"rạmjea jí"`);
		expect(normalize('rao4 2024')).toMatchInlineSnapshot(`"râo 2024"`);

		// On its own, ı̣ should stay ı̣: a dotless ı with an underdot.
		expect(normalize('ı̣')).toEqual('ı\u0323');
		expect(normalize('ji-pai')).toEqual('jı\u0323paı');
		// But when combining a tone on top of that, we should use ị followed by a combining character.
		expect(normalize('ji2-pai')).toEqual('jị\u0301paı');
		// The same is true for other vowels:
		expect(normalize('bu4-pai')).toEqual('bụ\u0302paı');
		// We use precomposed Vietnamese characters when possible:
		expect(normalize('dâ\u0323')).toEqual('dạ\u0302'.normalize());
		expect(normalize('dê\u0323')).toEqual('d\u1ec7'.normalize());
	});
});
