import { test, describe, expect } from 'vitest';
import {
	extract_pronominal_class,
	extract_frame,
	extract_distribution,
	extract_subject,
	cacheify,
	containsPhrase,
	default_ordering,
} from './search';
import { deburr } from './commons';
import type { Entry } from './commons';

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
	test('it extracts the distribution from a note', () => {
		expect(
			extract_distribution([
				{
					content: 'distribution: dn',
					date: new Date().toISOString(),
					user: 'test',
				},
			]),
		).toBe('d n');
	});
	test('it extracts the subject from a note', () => {
		expect(
			extract_subject([
				{
					content: 'subject : agent',
					date: new Date().toISOString(),
					user: 'test',
				},
			]),
		).toBe('agent');
	});
});

describe('scoring', () => {
	const entry = (head: string, body: string): Entry =>
		({
			id: head,
			date: new Date().toISOString(),
			head,
			body,
			user: 'test',
			scope: 'en',
			notes: [],
			votes: {},
			score: 0,
		}) as Entry;
	const score = (query: string, e: Entry) => {
		const bares = query.split(' ');
		return -default_ordering(cacheify(e), bares.flatMap(deburr), bares);
	};

	test('containsPhrase finds contiguous runs only', () => {
		expect(containsPhrase(['is', 'special'], ['x', 'is', 'special'])).toBe(
			true,
		);
		expect(containsPhrase(['is', 'special'], ['is', 'very', 'special'])).toBe(
			false,
		);
		expect(containsPhrase(['a', 'b', 'c'], ['a', 'b'])).toBe(false);
	});
	test('matching every query word beats matching one', () => {
		expect(
			score('is special', entry('bucem', '▯ is unusual, special.')),
		).toBeGreaterThan(score('is special', entry('sueq', '▯ is a wave.')));
	});
	test('the typographic head bonus needs the whole query', () => {
		// "da" (an exact head match) only beats "Da" by the typographic bonus.
		expect(score('da', entry('da', '▯ x.'))).toBeGreaterThan(
			score('da', entry('Da', '▯ x.')),
		);
		expect(score('pai da', entry('da', '▯ x.'))).toBe(
			score('pai da', entry('Da', '▯ x.')),
		);
	});
	test('a verbatim phrase beats scattered words', () => {
		expect(
			score('is special', entry('mụcem', '▯ is special / unusual.')),
		).toBeGreaterThan(
			score('is special', entry('bucem', '▯ is unusual, special.')),
		);
	});
});
