export interface WebhookPayload {
	embeds?: WebhookEmbed[];
}

export interface WebhookEmbed {
	color?: number;
	title?: string;
	fields?: { name: string; value: string }[];
	description?: string;
	url?: string;
}
