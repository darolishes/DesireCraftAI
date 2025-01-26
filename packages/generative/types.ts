import { z } from "zod";

/**
 * Configuration options for text generation
 */
export const generateOptionsSchema = z.object({
	prompt: z
		.string()
		.min(1, "Prompt cannot be empty")
		.max(1000, "Prompt exceeds maximum length of 1000 characters")
		.describe("The input prompt for generation"),

	model: z
		.string()
		.min(1, "Model name cannot be empty")
		.default("llama2")
		.describe("The name of the model to use for generation"),

	context: z
		.array(z.number())
		.optional()
		.default([])
		.describe("Previous conversation context tokens"),

	temperature: z
		.number()
		.min(0, "Temperature must be at least 0")
		.max(2, "Temperature cannot exceed 2")
		.optional()
		.default(0.7)
		.describe(
			"Controls randomness in the output (0 = deterministic, 2 = maximum randomness)",
		),

	topP: z
		.number()
		.min(0, "Top P must be at least 0")
		.max(1, "Top P cannot exceed 1")
		.optional()
		.default(0.9)
		.describe("Controls diversity via nucleus sampling"),

	system: z
		.string()
		.optional()
		.describe("System prompt to control the model's behavior"),

	stream: z
		.boolean()
		.optional()
		.default(false)
		.describe("Whether to stream the response token by token"),
});

export type GenerateOptions = z.infer<typeof generateOptionsSchema>;

/**
 * Response from the generation API
 */
export interface GenerateResponse {
	/** The generated text response */
	response: string;

	/** Token IDs from the conversation history */
	context: number[];

	/** Whether the generation is complete */
	done: boolean;

	/** Total time taken for the request in milliseconds */
	total_duration: number;

	/** Time taken to load the model in milliseconds */
	load_duration: number;

	/** Number of tokens in the prompt */
	prompt_eval_count: number;

	/** Total number of tokens evaluated */
	eval_count: number;

	/** Time spent on token generation in milliseconds */
	eval_duration: number;
}

/**
 * Streaming response handler
 */
export interface StreamHandler {
	/** Called when a new token is generated */
	onToken?(token: string): void | Promise<void>;

	/** Called when the generation is complete */
	onComplete?(response: GenerateResponse): void | Promise<void>;

	/** Called when an error occurs during streaming */
	onError?(error: Error): void | Promise<void>;
}

/**
 * Validation helper for generate options
 */
export const validateGenerateOptions = (options: unknown): GenerateOptions => {
	return generateOptionsSchema.parse(options);
};
