import { test, describe, expect } from 'vitest';
import {
	extract_pronominal_class,
	extract_frame,
	extract_distribution,
	extract_subject,
} from './search';

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
