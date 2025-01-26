import { Ollama } from "ollama";
import type { GenerateOptions } from "./types";

export class GenerativeClient {
	private ollama: Ollama;

	constructor(host?: string) {
		this.ollama = new Ollama({
			host: host || process.env.OLLAMA_HOST || "http://localhost:11434",
		});
	}

	async generate(options: GenerateOptions): Promise<string> {
		const { prompt, model = "llama2", context = {} } = options;

		const response = await this.ollama.generate({
			model,
			prompt,
			context,
		});

		return response.response;
	}
}
