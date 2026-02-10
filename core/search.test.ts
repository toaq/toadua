import { test, describe, expect } from 'vitest';
import { extract_pronominal_class, extract_frame } from './search';

describe('extract', () => {
	test('it extracts the pronominal class from a note', () => {
		expect(
			extract_pronominal_class([
				{
					content: 'pronominal class: hó',
					date: new Date().toISOString(),
					user: 'test',
				},
			]),
		).toBe('ho');
	});
	test('it extracts the frame from a note', () => {
		expect(
			extract_frame([
				{
					content: 'Frame : (c1)',
					date: new Date().toISOString(),
					user: 'test',
				},
			]),
		).toBe('c 1');
	});
});
