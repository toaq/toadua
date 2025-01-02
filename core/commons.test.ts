import { test, describe, expect } from 'vitest';
import { deburr } from './commons';

describe('deburr', () => {
	test('it deburrs Toaq text', () => {
		expect(deburr('Vyadi ꝡadi hoi2 gẹ́paı buq-gi ȷibo1!'))
			.toMatchInlineSnapshot(`
				[
				  "ꝡadi",
				  "ꝡadi",
				  "hoi",
				  "gepai",
				  "buqgi",
				  "jibo",
				]
			`);
	});
});
