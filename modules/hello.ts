import type { WebhookPayload } from './types.js';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { getRepositoryRootPath } from '../core/commons.js';

export class HelloModule {
	constructor(
		private enabled: boolean,
		private hook: string,
	) {}

	public up() {
		if (!this.enabled) return;

		try {
			const gitRoot = getRepositoryRootPath();
			this.sayHello(gitRoot);
		} catch (e) {
			console.error('Could not find git repository root:', e);
		}
	}

	async sayHello(gitRoot: string) {
		const head = await readFile(path.join(gitRoot, '.git', 'HEAD')).catch(e =>
			console.error('Could not read git HEAD:', e),
		);
		if (!head) return;

		await fetch(this.hook, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(<WebhookPayload>{
				embeds: [
					{
						color: 0,
						title: 'starting up',
						description: `commit ${head.toString()}`,
					},
				],
			}),
		});
	}
}
