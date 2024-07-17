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
	});
});
