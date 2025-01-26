import { Ollama } from "ollama";
import type { GenerateOptions } from "../types";

export class GenerativeError extends Error {
	constructor(
		message: string,
		public cause?: unknown,
	) {
		super(message);
		this.name = "GenerativeError";
	}
}

export class GenerativeClient {
	private ollama: Ollama;

	constructor(host?: string) {
		this.ollama = new Ollama({
			host: host || process.env.OLLAMA_HOST || "http://localhost:11434",
		});
	}

	async generate(options: GenerateOptions): Promise<string> {
		const { prompt, model = "llama2", context = {} } = options;

		try {
			const response = await this.ollama.generate({
				model,
				prompt,
				options: {
					temperature: 0.7,
					top_p: 0.9,
				},
				system: "You are a helpful AI assistant.",
				context: Object.entries(context).map(
					([key, value]) => `${key}: ${value}`,
				),
			});

			return response.response;
		} catch (error) {
			throw new GenerativeError(
				"Failed to generate content",
				error instanceof Error ? error : new Error(String(error)),
			);
		}
	}
}
