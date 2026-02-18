import type { WebhookPayload } from './types.js';

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
		const hash = process.env.GIT_HASH;
		const description = process.env.GIT_DESCRIPTION;

		await fetch(this.hook, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(<WebhookPayload>{
				embeds: [
					{
						color: 0,
						title: 'starting up',
						description: hash
							? `[${
									description ?? hash
							  }](https://github.com/toaq/toadua/commit/${hash})`
							: 'unknown commit',
					},
				],
			}),
		});
	}
}
