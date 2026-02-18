import type { WebhookPayload } from './types.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class HelloModule {
	constructor(
		private enabled: boolean,
		private hook: string,
	) {}

	public up() {
		if (!this.enabled) return;
		this.sayHello();
	}

	async sayHello() {
		let hash: string;
		try {
			const { stdout } = await execFileAsync('git', [
				'rev-parse',
				'--short',
				'HEAD',
			]);
			hash = stdout.trim();
		} catch (e) {
			console.error('Could not get git commit hash:', e);
			return;
		}

		await fetch(this.hook, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(<WebhookPayload>{
				embeds: [
					{
						color: 0,
						title: 'starting up',
						description: `[commit ${hash}](https://github.com/toaq/toadua/commit/${hash})`,
					},
				],
			}),
		});
	}
}
